import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  ckycDownloadRequestsTable,
  clientsTable,
  db,
} from "@workspace/db";
import {
  GenerateCkycDownloadRequestBatchBody,
  GenerateCkycDownloadRequestBatchResponse,
  GenerateCkycDownloadRequestBody,
  GenerateCkycDownloadRequestResponse,
  ListCkycDownloadRequestsResponse,
  UploadCkycDownloadResponseBody,
  UploadCkycDownloadResponseResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const REFERENCE_HEADER = "ALPHANUMERIC REFERENCE NO";
const KYC_NUMBER_HEADER = "KYC NUMBER";
const KYC_NUMBER_UPDATE_BATCH_SIZE = 5_000;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
  }
  return String(value);
}

function normalizeHeader(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeReference(value: string) {
  return value.trim().replace(/^'/, "").toUpperCase();
}

function normalizeClientReference(value: string) {
  return value.trim().replace(/^'/, "");
}

function normalizeKycNumber(value: string) {
  const text = value.trim().replace(/^'/, "");
  const scientific = text.match(/^(\d+(?:\.\d+)?)e\+(\d+)$/i);
  if (!scientific) return text;

  const [coefficient, exponentText] = scientific.slice(1);
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`;
  const decimalPlaces = fraction.length;
  const exponent = Number(exponentText);
  const zeros = exponent - decimalPlaces;
  if (!Number.isInteger(exponent) || zeros < 0) return text;
  return `${digits}${"0".repeat(zeros)}`;
}

function downloadReference(responseId: string) {
  return normalizeReference(responseId).slice(-14);
}

function normalizeDateOfBirth(value: string) {
  const text = value.trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return text;
  return `${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}-${match[3]}`;
}

async function parseDownloadResponse(fileContentBase64: string) {
  const rows = new Map<string, string>();
  let worksheetFound = false;
  let headersFound = false;
  try {
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(
      Readable.from([Buffer.from(fileContentBase64, "base64")]),
      {
        worksheets: "emit",
        sharedStrings: "cache",
        hyperlinks: "ignore",
        styles: "ignore",
        entries: "ignore",
      },
    );

    for await (const worksheet of workbook) {
      worksheetFound = true;
      let referenceColumn = 0;
      let kycNumberColumn = 0;

      for await (const row of worksheet) {
        if (!headersFound) {
          row.eachCell((cell, columnNumber) => {
            const header = normalizeHeader(cellText(cell.value));
            if (header === REFERENCE_HEADER) referenceColumn = columnNumber;
            if (header === KYC_NUMBER_HEADER) kycNumberColumn = columnNumber;
          });
          headersFound = Boolean(referenceColumn && kycNumberColumn);
          continue;
        }

        const reference = normalizeReference(
          cellText(row.getCell(referenceColumn).value),
        );
        if (!reference) continue;
        const kycNumber = normalizeKycNumber(
          cellText(row.getCell(kycNumberColumn).value),
        );
        if (kycNumber) rows.set(reference, kycNumber);
      }
      break;
    }
  } catch {
    throw new Error("The uploaded file is not a readable Excel workbook.");
  }

  if (!worksheetFound) {
    throw new Error("The Excel workbook does not contain a worksheet.");
  }
  if (!headersFound) {
    throw new Error(
      `The Excel file must contain "${REFERENCE_HEADER}" and "${KYC_NUMBER_HEADER}" columns.`,
    );
  }

  if (!rows.size) {
    throw new Error(
      "The Excel file does not contain any rows with a non-blank KYC Number.",
    );
  }
  return rows;
}

export function createCkycDownloadContent(data: {
  requestNumber: number;
  institutionCode: string;
  rows: Array<{ referenceNumber: string; dateOfBirth: string }>;
}) {
  const header = [
    "10",
    data.requestNumber,
    data.institutionCode,
    "1",
    "1BR",
    data.rows.length,
    "",
    "",
    "",
    "",
    "",
  ].join("|");
  const rows = data.rows.map(
    (row) =>
      `60|${row.referenceNumber}|${normalizeDateOfBirth(row.dateOfBirth)}|1||`,
  );
  return `${[header, ...rows].join("\r\n")}\r\n`;
}

function toResponse(
  request: typeof ckycDownloadRequestsTable.$inferSelect,
  includeContent = false,
) {
  return {
    id: request.id,
    requestNumber: request.requestNumber,
    fileName: request.fileName,
    recordCount: request.recordCount,
    sourceFileName: request.sourceFileName,
    createdAt: request.createdAt,
    ...(includeContent ? { content: request.content } : {}),
  };
}

router.get("/ckyc/download-requests", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(ckycDownloadRequestsTable)
    .orderBy(
      desc(ckycDownloadRequestsTable.createdAt),
      desc(ckycDownloadRequestsTable.id),
    )
    .limit(100);
  res.json(ListCkycDownloadRequestsResponse.parse(rows.map((row) => toResponse(row))));
});

router.post("/ckyc/download-requests", async (req, res): Promise<void> => {
  const parsed = GenerateCkycDownloadRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const matchedClients = await db
    .select({
      referenceNumber: clientsTable.ckycResponseId,
      dateOfBirth: clientsTable.dateOfBirth,
    })
    .from(clientsTable)
    .where(
      and(
        eq(clientsTable.ckycResponseStatus, "matched"),
        isNotNull(clientsTable.ckycResponseId),
        isNull(clientsTable.ckycNumber),
        inArray(clientsTable.id, parsed.data.clientIds),
      ),
    );
  if (!matchedClients.length) {
    res.status(400).json({
      error:
        "No CKYC response IDs are waiting for a download request. Upload the CKYC search response first, or all final KYC numbers are already saved.",
    });
    return;
  }

  const rows = matchedClients.map((client) => ({
    referenceNumber: downloadReference(client.referenceNumber!),
    dateOfBirth: client.dateOfBirth,
  }));
  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10701)`);
    const existing = await tx
      .select({ requestNumber: ckycDownloadRequestsTable.requestNumber })
      .from(ckycDownloadRequestsTable);
    const highest = existing.reduce(
      (value, row) => Math.max(value, row.requestNumber),
      10700,
    );
    const requestNumber = highest + 1;
    const fileName = `${parsed.data.institutionCode}_1_${parsed.data.fileDate}_${parsed.data.version}_${parsed.data.iraCode}_D${requestNumber}.txt`;
    const content = createCkycDownloadContent({
      requestNumber,
      institutionCode: parsed.data.institutionCode,
      rows,
    });
    const [saved] = await tx
      .insert(ckycDownloadRequestsTable)
      .values({
        requestNumber,
        fileName,
        content,
        recordCount: rows.length,
        sourceFileName: "CKYC client register",
      })
      .returning();
    return saved;
  });

  res
    .status(201)
    .json(GenerateCkycDownloadRequestResponse.parse(toResponse(created, true)));
});

router.post(
  "/ckyc/download-requests/batch",
  async (req, res): Promise<void> => {
    const parsed = GenerateCkycDownloadRequestBatchBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    if (!Number.isInteger(parsed.data.maxRows)) {
      res.status(400).json({ error: "The rows-per-file limit must be a whole number." });
      return;
    }

    const requestedReferences = [
      ...new Set(
        parsed.data.clientReferences
          .map(normalizeClientReference)
          .filter(Boolean),
      ),
    ];
    const requestedReferenceKeys = new Set(
      requestedReferences.map(normalizeReference),
    );
    const matchedById = new Map<
      number,
      {
        id: number;
        clientId: string;
        loanid: string;
        responseId: string | null;
        dateOfBirth: string;
      }
    >();
    const lookupChunkSize = 500;

    for (
      let index = 0;
      index < requestedReferences.length;
      index += lookupChunkSize
    ) {
      const chunk = requestedReferences.slice(index, index + lookupChunkSize);
      const numericIds = chunk
        .filter((reference) => /^\d+$/.test(reference))
        .map(Number);
      const referenceFilters = [
        inArray(clientsTable.clientId, chunk),
        inArray(clientsTable.loanid, chunk),
        inArray(clientsTable.ckycResponseId, chunk),
      ];
      if (numericIds.length) {
        referenceFilters.push(inArray(clientsTable.id, numericIds));
      }

      const rows = await db
        .select({
          id: clientsTable.id,
          clientId: clientsTable.clientId,
          loanid: clientsTable.loanid,
          responseId: clientsTable.ckycResponseId,
          dateOfBirth: clientsTable.dateOfBirth,
        })
        .from(clientsTable)
        .where(
          and(
            eq(clientsTable.ckycResponseStatus, "matched"),
            isNotNull(clientsTable.ckycResponseId),
            isNull(clientsTable.ckycNumber),
            or(...referenceFilters),
          ),
        );
      for (const row of rows) matchedById.set(row.id, row);
    }

    const matchesByReference = new Map<
      string,
      Array<(typeof matchedById extends Map<number, infer Row> ? Row : never)>
    >();
    for (const row of matchedById.values()) {
      for (const value of [row.clientId, row.loanid, row.responseId ?? ""]) {
        const key = normalizeReference(value);
        if (!key || !requestedReferenceKeys.has(key)) continue;
        const matches = matchesByReference.get(key) ?? [];
        matches.push(row);
        matchesByReference.set(key, matches);
      }
    }

    const orderedMatches: Array<
      (typeof matchedById extends Map<number, infer Row> ? Row : never)
    > = [];
    const orderedIds = new Set<number>();
    const unmatchedReferences: string[] = [];
    for (const reference of requestedReferences) {
      const key = normalizeReference(reference);
      const matches = matchesByReference.get(key) ?? [];
      if (!matches.length) {
        unmatchedReferences.push(reference);
        continue;
      }
      for (const row of matches) {
        if (orderedIds.has(row.id)) continue;
        orderedIds.add(row.id);
        orderedMatches.push(row);
      }
    }

    if (!orderedMatches.length) {
      res.status(400).json({
        error:
          "No selected clients have matched CKYC response IDs waiting for download.",
      });
      return;
    }

    const sourceFileName =
      parsed.data.sourceFileName?.trim() || "Uploaded client selection";
    const lots: Array<
      Array<{ referenceNumber: string; dateOfBirth: string }>
    > = [];
    for (let index = 0; index < orderedMatches.length; index += parsed.data.maxRows) {
      lots.push(
        orderedMatches.slice(index, index + parsed.data.maxRows).map((client) => ({
          referenceNumber: downloadReference(client.responseId!),
          dateOfBirth: client.dateOfBirth,
        })),
      );
    }

    const savedRequests = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(10701)`);
      const existing = await tx
        .select({ requestNumber: ckycDownloadRequestsTable.requestNumber })
        .from(ckycDownloadRequestsTable);
      const highest = existing.reduce(
        (value, row) => Math.max(value, row.requestNumber),
        10700,
      );
      const values = lots.map((rows, index) => {
        const requestNumber = highest + index + 1;
        return {
          requestNumber,
          fileName: `${parsed.data.institutionCode}_1_${parsed.data.fileDate}_${parsed.data.version}_${parsed.data.iraCode}_D${requestNumber}.txt`,
          content: createCkycDownloadContent({
            requestNumber,
            institutionCode: parsed.data.institutionCode,
            rows,
          }),
          recordCount: rows.length,
          sourceFileName,
        };
      });
      return tx.insert(ckycDownloadRequestsTable).values(values).returning();
    });

    res.status(201).json(
      GenerateCkycDownloadRequestBatchResponse.parse({
        requests: savedRequests
          .sort((left, right) => left.requestNumber - right.requestNumber)
          .map((request) => toResponse(request, true)),
        totalRecordCount: orderedMatches.length,
        matchedClientCount: orderedMatches.length,
        unmatchedReferences,
      }),
    );
  },
);

router.post("/ckyc/download-requests/response", async (req, res): Promise<void> => {
  const parsed = UploadCkycDownloadResponseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let responseRows: Map<string, string>;
  try {
    responseRows = await parseDownloadResponse(parsed.data.fileContentBase64);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid Excel response.",
    });
    return;
  }

  const clients = await db
    .select({
      id: clientsTable.id,
      responseId: clientsTable.ckycResponseId,
      ckycNumber: clientsTable.ckycNumber,
    })
    .from(clientsTable)
    .where(isNotNull(clientsTable.ckycResponseId));
  const clientsByReference = new Map<
    string,
    Array<(typeof clients)[number]>
  >();
  for (const client of clients) {
    if (!client.responseId) continue;
    const reference = downloadReference(client.responseId);
    const matching = clientsByReference.get(reference) ?? [];
    matching.push(client);
    clientsByReference.set(reference, matching);
  }

  const missingReferences: string[] = [];
  const updates: Array<{ id: number; kycNumber: string }> = [];
  let matchedReferenceCount = 0;
  for (const [reference, kycNumber] of responseRows) {
    const matchingClients = clientsByReference.get(downloadReference(reference));
    if (!matchingClients?.length) {
      missingReferences.push(reference);
      continue;
    }
    matchedReferenceCount += 1;
    for (const client of matchingClients) {
      updates.push({ id: client.id, kycNumber });
    }
  }

  if (updates.length) {
    await db.transaction(async (tx) => {
      for (
        let index = 0;
        index < updates.length;
        index += KYC_NUMBER_UPDATE_BATCH_SIZE
      ) {
        const batch = updates.slice(index, index + KYC_NUMBER_UPDATE_BATCH_SIZE);
        const values = sql.join(
          batch.map(
            (update) => sql`(${update.id}::integer, ${update.kycNumber}::text)`,
          ),
          sql`, `,
        );
        await tx.execute(sql`
          UPDATE "clients" AS client_rows
          SET ckyc_number = update_rows.kyc_number
          FROM (VALUES ${values}) AS update_rows(id, kyc_number)
          WHERE client_rows.id = update_rows.id
        `);
      }
    });
  }

  res.json(
    UploadCkycDownloadResponseResponse.parse({
      sourceFileName: parsed.data.sourceFileName,
      updatedCount: updates.length,
      skippedCount: responseRows.size - matchedReferenceCount,
      missingReferences,
    }),
  );
});

export default router;