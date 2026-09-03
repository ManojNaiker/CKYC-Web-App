import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  ckycDownloadRequestsTable,
  clientsTable,
  db,
} from "@workspace/db";
import {
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
  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    const bytes = Uint8Array.from(Buffer.from(fileContentBase64, "base64"));
    await workbook.xlsx.load(bytes.buffer);
  } catch {
    throw new Error("The uploaded file is not a readable Excel workbook.");
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The Excel workbook does not contain a worksheet.");

  let headerRow = 0;
  let referenceColumn = 0;
  let kycNumberColumn = 0;
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell, columnNumber) => {
      const header = normalizeHeader(cellText(cell.value));
      if (header === REFERENCE_HEADER) {
        headerRow = rowNumber;
        referenceColumn = columnNumber;
      }
      if (header === KYC_NUMBER_HEADER) kycNumberColumn = columnNumber;
    });
  });

  if (!referenceColumn || !kycNumberColumn) {
    throw new Error(
      `The Excel file must contain "${REFERENCE_HEADER}" and "${KYC_NUMBER_HEADER}" columns.`,
    );
  }

  const rows = new Map<string, string>();
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const reference = normalizeReference(
      cellText(worksheet.getRow(rowNumber).getCell(referenceColumn).value),
    );
    if (!reference) continue;
    const kycNumber = normalizeKycNumber(
      cellText(worksheet.getRow(rowNumber).getCell(kycNumberColumn).value),
    );
    if (kycNumber) rows.set(reference, kycNumber);
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