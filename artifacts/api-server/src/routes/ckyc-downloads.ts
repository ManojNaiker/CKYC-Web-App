import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import { desc, eq, sql } from "drizzle-orm";
import {
  ckycDownloadRequestsTable,
  clientsTable,
  db,
} from "@workspace/db";
import {
  GenerateCkycDownloadRequestBody,
  GenerateCkycDownloadRequestResponse,
  ListCkycDownloadRequestsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const REFERENCE_HEADER = "ALPHANUMERIC REFERENCE NO";

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

function normalizeDateOfBirth(value: string) {
  const text = value.trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (!match) return text;
  return `${match[1].padStart(2, "0")}-${match[2].padStart(2, "0")}-${match[3]}`;
}

async function parseReferenceNumbers(fileContentBase64: string) {
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
  worksheet.eachRow((row, rowNumber) => {
    if (referenceColumn) return;
    row.eachCell((cell, columnNumber) => {
      if (normalizeHeader(cellText(cell.value)) === REFERENCE_HEADER) {
        headerRow = rowNumber;
        referenceColumn = columnNumber;
      }
    });
  });

  if (!referenceColumn) {
    throw new Error(
      `The Excel file must contain an "${REFERENCE_HEADER}" column.`,
    );
  }

  const references: string[] = [];
  const seen = new Set<string>();
  for (let rowNumber = headerRow + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const reference = normalizeReference(
      cellText(worksheet.getRow(rowNumber).getCell(referenceColumn).value),
    );
    if (!reference || seen.has(reference)) continue;
    seen.add(reference);
    references.push(reference);
  }

  if (!references.length) {
    throw new Error("The Excel file does not contain any CKYC reference numbers.");
  }
  return references;
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

  let references: string[];
  try {
    references = await parseReferenceNumbers(parsed.data.fileContentBase64);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid Excel file.",
    });
    return;
  }

  const matchedClients = await db
    .select({
      referenceNumber: clientsTable.ckycResponseId,
      dateOfBirth: clientsTable.dateOfBirth,
    })
    .from(clientsTable)
    .where(eq(clientsTable.ckycResponseStatus, "matched"));
  const clientsByReference = new Map(
    matchedClients.flatMap((client) =>
      client.referenceNumber
        ? [[normalizeReference(client.referenceNumber), client] as const]
        : [],
    ),
  );
  const missing = references.filter((reference) => !clientsByReference.has(reference));
  if (missing.length) {
    res.status(400).json({
      error: `No saved client date of birth was found for ${missing.length} CKYC reference number(s): ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`,
    });
    return;
  }

  const rows = references.map((referenceNumber) => ({
    referenceNumber,
    dateOfBirth: clientsByReference.get(referenceNumber)!.dateOfBirth,
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
        sourceFileName: parsed.data.sourceFileName,
      })
      .returning();
    return saved;
  });

  res
    .status(201)
    .json(GenerateCkycDownloadRequestResponse.parse(toResponse(created, true)));
});

export default router;