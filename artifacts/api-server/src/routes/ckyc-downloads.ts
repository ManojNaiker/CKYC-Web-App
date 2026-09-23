import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import {
  and,
  asc,
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
  ckycDownloadResponseRecordsTable,
  clientsTable,
  db,
} from "@workspace/db";
import {
  GenerateCkycDownloadRequestBatchBody,
  GenerateCkycDownloadRequestBatchResponse,
  GenerateCkycDownloadRequestBody,
  GenerateCkycDownloadRequestResponse,
  ListCkycDownloadResponseFilesResponse,
  ListCkycDownloadRequestsResponse,
  UploadCkycDownloadResponseBody,
  UploadCkycDownloadResponseResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const REFERENCE_HEADER = "ALPHANUMERIC REFERENCE NO";
const KYC_NUMBER_HEADER = "KYC NUMBER";
const KYC_NUMBER_UPDATE_BATCH_SIZE = 5_000;

type DownloadClientRow = {
  id: number;
  clientId: string;
  loanid: string;
  responseId: string | null;
  dateOfBirth: string;
  disbursedOnDate: string;
};

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
  const isoMatch = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (isoMatch) {
    return `${isoMatch[3].padStart(2, "0")}-${isoMatch[2].padStart(
      2,
      "0",
    )}-${isoMatch[1]}`;
  }

  const dayFirstMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!dayFirstMatch) return text;
  return `${dayFirstMatch[1].padStart(2, "0")}-${dayFirstMatch[2].padStart(
    2,
    "0",
  )}-${dayFirstMatch[3]}`;
}

function normalizeDisbursementDate(value: string | Date) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const text = value.trim();
  const isoMatch = text.match(
    /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:[T\s].*)?$/,
  );
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const dayFirstMatch = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dayFirstMatch) {
    return `${dayFirstMatch[3]}-${dayFirstMatch[2].padStart(2, "0")}-${dayFirstMatch[1].padStart(2, "0")}`;
  }

  return null;
}

function isValidDateKey(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

type ParsedDownloadResponse = {
  requestNumber: number | null;
  recordCount: number;
  rows: Map<string, string>;
  storedContent: string;
};

function requestNumberFromFileName(sourceFileName: string) {
  const match = sourceFileName.match(/(?:^|[-_])D?(\d{5,})(?=[-_.]|$)/i);
  return match ? Number(match[1]) : null;
}

function parseTextDownloadResponse(
  content: string,
  sourceFileName: string,
): ParsedDownloadResponse {
  const lines = content
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);
  const header = lines[0]?.split("|") ?? [];
  if (header[0] !== "10") {
    throw new Error("The uploaded TXT file does not have a valid type 10 header.");
  }

  const responseRows = lines.slice(1).filter((line) => line.split("|")[0] === "20");
  if (!responseRows.length) {
    throw new Error("The uploaded TXT file does not contain any type 20 response rows.");
  }

  const headerRequestNumber = /^\d+$/.test(header[1]?.trim() ?? "")
    ? Number(header[1].trim())
    : null;
  return {
    requestNumber: headerRequestNumber ?? requestNumberFromFileName(sourceFileName),
    recordCount: responseRows.length,
    rows: new Map(),
    storedContent: content,
  };
}

async function parseDownloadResponse(
  fileContentBase64: string,
  sourceFileName: string,
): Promise<ParsedDownloadResponse> {
  const buffer = Buffer.from(fileContentBase64, "base64");
  const textPreview = buffer.toString("utf8", 0, 32).replace(/^\uFEFF/, "");
  if (sourceFileName.toLowerCase().endsWith(".txt") || textPreview.trimStart().startsWith("10|")) {
    return parseTextDownloadResponse(buffer.toString("utf8"), sourceFileName);
  }

  const rows = new Map<string, string>();
  let worksheetFound = false;
  let headersFound = false;
  try {
    const workbook = new ExcelJS.stream.xlsx.WorkbookReader(
      Readable.from([buffer]),
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
  return {
    requestNumber: requestNumberFromFileName(sourceFileName),
    recordCount: rows.size,
    rows,
    storedContent: fileContentBase64,
  };
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
    responseFileName: request.responseFileName,
    responseAt: request.responseAt,
    createdAt: request.createdAt,
    ...(includeContent ? { content: request.content } : {}),
  };
}

function responseFilePayload(fileName: string, content: string) {
  const isTextResponse =
    fileName.toLowerCase().endsWith(".txt") ||
    content.trimStart().startsWith("10|");
  return {
    isTextResponse,
    buffer: isTextResponse
      ? Buffer.from(content, "utf8")
      : Buffer.from(content, "base64"),
  };
}

async function attachStoredResponseToRequest(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  response: typeof ckycDownloadResponseRecordsTable.$inferSelect,
) {
  if (response.requestNumber === null) return null;
  const [request] = await tx
    .select()
    .from(ckycDownloadRequestsTable)
    .where(eq(ckycDownloadRequestsTable.requestNumber, response.requestNumber))
    .limit(1);
  if (!request) return null;

  const [updatedRequest] = await tx
    .update(ckycDownloadRequestsTable)
    .set({
      responseFileName: response.sourceFileName,
      responseContent: response.content,
      responseAt: response.createdAt,
    })
    .where(eq(ckycDownloadRequestsTable.id, request.id))
    .returning();
  await tx
    .update(ckycDownloadResponseRecordsTable)
    .set({ matchedRequestId: request.id, matchedAt: new Date() })
    .where(eq(ckycDownloadResponseRecordsTable.id, response.id));
  return updatedRequest;
}

async function attachPendingResponseToRequest(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  request: typeof ckycDownloadRequestsTable.$inferSelect,
) {
  const [pendingResponse] = await tx
    .select()
    .from(ckycDownloadResponseRecordsTable)
    .where(
      and(
        eq(ckycDownloadResponseRecordsTable.requestNumber, request.requestNumber),
        isNull(ckycDownloadResponseRecordsTable.matchedRequestId),
      ),
    )
    .orderBy(
      desc(ckycDownloadResponseRecordsTable.createdAt),
      desc(ckycDownloadResponseRecordsTable.id),
    )
    .limit(1);
  if (!pendingResponse) return request;
  return (
    (await attachStoredResponseToRequest(tx, pendingResponse)) ?? request
  );
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

router.get(
  "/ckyc/download-requests/:id/file",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(404).json({ error: "Download request not found." });
      return;
    }

    const [request] = await db
      .select({
        fileName: ckycDownloadRequestsTable.fileName,
        content: ckycDownloadRequestsTable.content,
      })
      .from(ckycDownloadRequestsTable)
      .where(eq(ckycDownloadRequestsTable.id, id))
      .limit(1);
    if (!request) {
      res.status(404).json({ error: "Download request not found." });
      return;
    }

    const safeFileName = request.fileName.replace(/["\\\r\n]/g, "_");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`,
    );
    res.send(request.content);
  },
);

router.get(
  "/ckyc/download-requests/:id/response-file",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(404).json({ error: "Final CKYC response file not found." });
      return;
    }

    const [request] = await db
      .select({
        responseFileName: ckycDownloadRequestsTable.responseFileName,
        responseContent: ckycDownloadRequestsTable.responseContent,
      })
      .from(ckycDownloadRequestsTable)
      .where(eq(ckycDownloadRequestsTable.id, id))
      .limit(1);
    if (!request?.responseFileName || !request.responseContent) {
      res.status(404).json({ error: "Final CKYC response file not found." });
      return;
    }

    const safeFileName = request.responseFileName.replace(/["\\\r\n]/g, "_");
    const responsePayload = responseFilePayload(
      request.responseFileName,
      request.responseContent,
    );
    res.setHeader(
      "Content-Type",
      responsePayload.isTextResponse
        ? "text/plain; charset=utf-8"
        : "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`,
    );
    res.send(responsePayload.buffer);
  },
);

router.get(
  "/ckyc/download-requests/response-files",
  async (req, res): Promise<void> => {
    const rows = await db
      .select({
        id: ckycDownloadResponseRecordsTable.id,
        sourceFileName: ckycDownloadResponseRecordsTable.sourceFileName,
        requestNumber: ckycDownloadResponseRecordsTable.requestNumber,
        recordCount: ckycDownloadResponseRecordsTable.recordCount,
        matchedRequestId: ckycDownloadResponseRecordsTable.matchedRequestId,
        archivedAt: ckycDownloadResponseRecordsTable.archivedAt,
        createdAt: ckycDownloadResponseRecordsTable.createdAt,
      })
      .from(ckycDownloadResponseRecordsTable)
      .where(
        req.query.includeArchived === "true"
          ? undefined
          : isNull(ckycDownloadResponseRecordsTable.archivedAt),
      )
      .orderBy(
        desc(ckycDownloadResponseRecordsTable.id),
        desc(ckycDownloadResponseRecordsTable.createdAt),
      )
      .limit(50);
    res.json(ListCkycDownloadResponseFilesResponse.parse(rows));
  },
);

router.post(
  "/ckyc/download-requests/response-files/:id/archive",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(404).json({ error: "Uploaded final CKYC response file not found." });
      return;
    }

    const [updated] = await db
      .update(ckycDownloadResponseRecordsTable)
      .set({ archivedAt: new Date() })
      .where(eq(ckycDownloadResponseRecordsTable.id, id))
      .returning({
        id: ckycDownloadResponseRecordsTable.id,
        sourceFileName: ckycDownloadResponseRecordsTable.sourceFileName,
        requestNumber: ckycDownloadResponseRecordsTable.requestNumber,
        recordCount: ckycDownloadResponseRecordsTable.recordCount,
        matchedRequestId: ckycDownloadResponseRecordsTable.matchedRequestId,
        archivedAt: ckycDownloadResponseRecordsTable.archivedAt,
        createdAt: ckycDownloadResponseRecordsTable.createdAt,
      });
    if (!updated) {
      res.status(404).json({ error: "Uploaded final CKYC response file not found." });
      return;
    }
    res.json(ListCkycDownloadResponseFilesResponse.parse([updated])[0]);
  },
);

router.post(
  "/ckyc/download-requests/response-files/:id/restore",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(404).json({ error: "Uploaded final CKYC response file not found." });
      return;
    }

    const [updated] = await db
      .update(ckycDownloadResponseRecordsTable)
      .set({ archivedAt: null })
      .where(eq(ckycDownloadResponseRecordsTable.id, id))
      .returning({
        id: ckycDownloadResponseRecordsTable.id,
        sourceFileName: ckycDownloadResponseRecordsTable.sourceFileName,
        requestNumber: ckycDownloadResponseRecordsTable.requestNumber,
        recordCount: ckycDownloadResponseRecordsTable.recordCount,
        matchedRequestId: ckycDownloadResponseRecordsTable.matchedRequestId,
        archivedAt: ckycDownloadResponseRecordsTable.archivedAt,
        createdAt: ckycDownloadResponseRecordsTable.createdAt,
      });
    if (!updated) {
      res.status(404).json({ error: "Uploaded final CKYC response file not found." });
      return;
    }
    res.json(ListCkycDownloadResponseFilesResponse.parse([updated])[0]);
  },
);

router.get(
  "/ckyc/download-requests/response-files/:id/file",
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(404).json({ error: "Uploaded final CKYC response file not found." });
      return;
    }

    const [response] = await db
      .select({
        sourceFileName: ckycDownloadResponseRecordsTable.sourceFileName,
        content: ckycDownloadResponseRecordsTable.content,
      })
      .from(ckycDownloadResponseRecordsTable)
      .where(eq(ckycDownloadResponseRecordsTable.id, id))
      .limit(1);
    if (!response) {
      res.status(404).json({ error: "Uploaded final CKYC response file not found." });
      return;
    }

    const safeFileName = response.sourceFileName.replace(/["\\\r\n]/g, "_");
    const responsePayload = responseFilePayload(
      response.sourceFileName,
      response.content,
    );
    res.setHeader(
      "Content-Type",
      responsePayload.isTextResponse
        ? "text/plain; charset=utf-8"
        : "application/octet-stream",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeFileName}"`,
    );
    res.send(responsePayload.buffer);
  },
);

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
    return attachPendingResponseToRequest(tx, saved);
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
        (parsed.data.clientReferences ?? [])
          .map(normalizeClientReference)
          .filter(Boolean),
      ),
    ];
    const hasClientSelection = requestedReferences.length > 0;
    const hasDateCriteria = Boolean(
      parsed.data.disbursementFrom || parsed.data.disbursementTo,
    );
    if (!hasClientSelection && !hasDateCriteria) {
      res.status(400).json({
        error: "Provide a disbursement date or upload a client selection CSV.",
      });
      return;
    }

    const disbursementFrom = parsed.data.disbursementFrom
      ? normalizeDisbursementDate(parsed.data.disbursementFrom)
      : null;
    const disbursementTo = parsed.data.disbursementTo
      ? normalizeDisbursementDate(parsed.data.disbursementTo)
      : null;
    if (
      (parsed.data.disbursementFrom && !isValidDateKey(disbursementFrom)) ||
      (parsed.data.disbursementTo && !isValidDateKey(disbursementTo))
    ) {
      res.status(400).json({
        error: "Disbursement dates must be valid calendar dates.",
      });
      return;
    }
    if (
      disbursementFrom &&
      disbursementTo &&
      disbursementFrom > disbursementTo
    ) {
      res.status(400).json({
        error: "Disbursement From date cannot be after the To date.",
      });
      return;
    }

    const requestedReferenceKeys = new Set(
      requestedReferences.map(normalizeReference),
    );
    const matchedById = new Map<number, DownloadClientRow>();
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
          disbursedOnDate: clientsTable.disbursedOnDate,
        })
        .from(clientsTable)
        .where(
          and(
            eq(clientsTable.ckycResponseStatus, "matched"),
            isNotNull(clientsTable.ckycResponseId),
            isNull(clientsTable.ckycNumber),
            or(...referenceFilters),
          ),
        )
        .orderBy(asc(clientsTable.id));
      for (const row of rows) matchedById.set(row.id, row);
    }

    if (hasDateCriteria) {
      const dateMatches = await db
        .select({
          id: clientsTable.id,
          clientId: clientsTable.clientId,
          loanid: clientsTable.loanid,
          responseId: clientsTable.ckycResponseId,
          dateOfBirth: clientsTable.dateOfBirth,
          disbursedOnDate: clientsTable.disbursedOnDate,
        })
        .from(clientsTable)
        .where(
          and(
            eq(clientsTable.ckycResponseStatus, "matched"),
            isNotNull(clientsTable.ckycResponseId),
            isNull(clientsTable.ckycNumber),
          ),
        )
        .orderBy(asc(clientsTable.id));

      for (const row of dateMatches) {
        const disbursedDate = normalizeDisbursementDate(row.disbursedOnDate);
        if (!isValidDateKey(disbursedDate)) continue;
        if (
          (!disbursementFrom || disbursedDate >= disbursementFrom) &&
          (!disbursementTo || disbursedDate <= disbursementTo)
        ) {
          matchedById.set(row.id, row);
        }
      }
    }

    const matchesByReference = new Map<
      string,
      DownloadClientRow[]
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

    const orderedMatches: DownloadClientRow[] = [];
    const orderedClientIds = new Set<string>();
    const unmatchedReferences: string[] = [];
    if (hasClientSelection) {
      for (const reference of requestedReferences) {
        const key = normalizeReference(reference);
        const matches = matchesByReference.get(key) ?? [];
        if (!matches.length) {
          unmatchedReferences.push(reference);
          continue;
        }
        for (const row of matches) {
          if (orderedClientIds.has(row.clientId)) continue;
          orderedClientIds.add(row.clientId);
          orderedMatches.push(row);
        }
      }
    }
    for (const row of matchedById.values()) {
      if (orderedClientIds.has(row.clientId)) continue;
      if (!hasClientSelection || hasDateCriteria) {
        orderedClientIds.add(row.clientId);
        orderedMatches.push(row);
      }
    }

    if (!orderedMatches.length) {
      res.status(400).json({
        error:
          "No matched CKYC response IDs were found for the selected date or client upload.",
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
      const savedRequests = await tx
        .insert(ckycDownloadRequestsTable)
        .values(values)
        .returning();
      return Promise.all(
        savedRequests.map((request) =>
          attachPendingResponseToRequest(tx, request),
        ),
      );
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

  let parsedResponse: ParsedDownloadResponse;
  try {
    parsedResponse = await parseDownloadResponse(
      parsed.data.fileContentBase64,
      parsed.data.sourceFileName,
    );
  } catch (error) {
    res.status(400).json({
      error:
        error instanceof Error ? error.message : "Invalid CKYC response file.",
    });
    return;
  }

  const clients = await db
    .select({
      id: clientsTable.id,
      responseId: clientsTable.ckycResponseId,
    })
    .from(clientsTable)
    .where(
      and(
        isNotNull(clientsTable.ckycResponseId),
        parsedResponse.rows.size ? sql`true` : sql`false`,
      ),
    );
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
  for (const [reference, kycNumber] of parsedResponse.rows) {
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

  const storedResponse = await db.transaction(async (tx) => {
    const [stored] = await tx
      .insert(ckycDownloadResponseRecordsTable)
      .values({
        requestNumber: parsedResponse.requestNumber,
        sourceFileName: parsed.data.sourceFileName,
        content: parsedResponse.storedContent,
        recordCount: parsedResponse.recordCount,
      })
      .returning();

    if (updates.length) {
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
    }

    const matchedRequest = await attachStoredResponseToRequest(tx, stored);
    return { stored, matchedRequest };
  });

  res.json(
    UploadCkycDownloadResponseResponse.parse({
      sourceFileName: parsed.data.sourceFileName,
      storedRecordId: storedResponse.stored.id,
      requestNumber: parsedResponse.requestNumber,
      storedRecordCount: parsedResponse.recordCount,
      requestMatched: Boolean(storedResponse.matchedRequest),
      updatedCount: updates.length,
      skippedCount: parsedResponse.rows.size - matchedReferenceCount,
      missingReferences,
    }),
  );
});

export default router;