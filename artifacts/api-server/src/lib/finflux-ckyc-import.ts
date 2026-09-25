import ExcelJS from "exceljs";
import { Readable } from "node:stream";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_RECORDS = 1000;

export interface FinfluxImportPreviewRow {
  rowNumber: number;
  clientId: string | null;
  ckycNumber: string | null;
  valid: boolean;
  error: string | null;
}

export interface FinfluxImportPreview {
  fileName: string;
  totalRows: number;
  validCount: number;
  invalidCount: number;
  rows: FinfluxImportPreviewRow[];
}

export class FinfluxImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinfluxImportError";
  }
}

function decodeBase64(fileContentBase64: string): Buffer {
  const compact = fileContentBase64.replace(/\s/g, "");
  if (
    !compact ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      compact,
    )
  ) {
    throw new FinfluxImportError("The uploaded file could not be decoded.");
  }
  const buffer = Buffer.from(compact, "base64");
  if (!buffer.length) {
    throw new FinfluxImportError("The uploaded file is empty.");
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new FinfluxImportError(
      "The file is over 15 MB. Split it into smaller files and upload again.",
    );
  }
  return buffer;
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/[_\-\s]+/g, " ").toUpperCase();
}

function findColumn(headers: string[], aliases: string[]): number {
  const normalizedAliases = new Set(aliases.map(normalizeHeader));
  return headers.findIndex((header) =>
    normalizedAliases.has(normalizeHeader(header)),
  );
}

function parseCsvRecords(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (character === '"' && quoted && next === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(field);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new FinfluxImportError(
      "The CSV contains an unfinished quoted field.",
    );
  }
  row.push(field);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function cellText(value: ExcelJS.CellValue | undefined): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) => part.text)
        .join("");
    }
  }
  return String(value);
}

function getColumnIndexes(headers: string[]) {
  const clientId = findColumn(headers, [
    "CLIENT ID",
    "CLIENTID",
    "CLIENT_ID",
    "LMS CLIENT ID",
    "FINFLUX CLIENT ID",
  ]);
  const ckycNumber = findColumn(headers, [
    "CKYC NUMBER",
    "CKYCNUMBER",
    "CKYC_NUMBER",
    "FINAL CKYC NUMBER",
    "FINAL CKYC",
  ]);

  if (clientId < 0 || ckycNumber < 0) {
    const missing = [
      clientId < 0 ? "client_id" : null,
      ckycNumber < 0 ? "ckyc_number" : null,
    ].filter((value): value is string => value !== null);
    throw new FinfluxImportError(
      `Required column${missing.length > 1 ? "s are" : " is"} missing: ${missing.join(", ")}.`,
    );
  }
  return { clientId, ckycNumber };
}

function normalizeValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || ["NONE", "NAN", "NULL", "N/A"].includes(trimmed.toUpperCase())) {
    return null;
  }
  return trimmed;
}

function buildPreview(
  fileName: string,
  rawRows: Array<{ rowNumber: number; values: string[] }>,
): FinfluxImportPreview {
  if (!rawRows.length) {
    throw new FinfluxImportError(
      "No data rows were found. Add rows below the header and upload again.",
    );
  }
  if (rawRows.length > MAX_RECORDS) {
    throw new FinfluxImportError(
      `The file contains more than ${MAX_RECORDS} rows. Split it into smaller files and upload again.`,
    );
  }

  const clientIds = rawRows.map(({ values }) =>
    normalizeValue(values[1] ?? ""),
  );
  const idCounts = new Map<string, number>();
  for (const clientId of clientIds) {
    if (clientId) idCounts.set(clientId, (idCounts.get(clientId) ?? 0) + 1);
  }

  const rows = rawRows.map(({ rowNumber, values }) => {
    const clientId = normalizeValue(values[1] ?? "");
    const ckycNumber = normalizeValue(values[2] ?? "");
    const errors = [
      !clientId ? "Missing client_id." : null,
      !ckycNumber ? "Missing ckyc_number." : null,
      clientId && (idCounts.get(clientId) ?? 0) > 1
        ? "Duplicate client_id in this file."
        : null,
    ].filter((value): value is string => value !== null);

    return {
      rowNumber,
      clientId,
      ckycNumber,
      valid: errors.length === 0,
      error: errors.length ? errors.join(" ") : null,
    };
  });
  const validCount = rows.filter((row) => row.valid).length;

  return {
    fileName,
    totalRows: rows.length,
    validCount,
    invalidCount: rows.length - validCount,
    rows,
  };
}

function buildPreviewWithHeaders(
  fileName: string,
  headers: string[],
  dataRows: Array<{ rowNumber: number; values: string[] }>,
): FinfluxImportPreview {
  const columns = getColumnIndexes(headers);
  return buildPreview(
    fileName,
    dataRows.map(({ rowNumber, values }) => ({
      rowNumber,
      values: [
        "",
        values[columns.clientId] ?? "",
        values[columns.ckycNumber] ?? "",
      ],
    })),
  );
}

export async function previewFinfluxImportFile(
  fileName: string,
  fileContentBase64: string,
): Promise<FinfluxImportPreview> {
  const buffer = decodeBase64(fileContentBase64);
  const lowerName = fileName.toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const rows = parseCsvRecords(buffer.toString("utf8").replace(/^\uFEFF/, ""));
    if (!rows.length) throw new FinfluxImportError("The uploaded CSV is empty.");
    const [headers, ...dataRows] = rows;
    return buildPreviewWithHeaders(
      fileName,
      headers,
      dataRows.map((values, index) => ({ rowNumber: index + 2, values })),
    );
  }

  if (!lowerName.endsWith(".xlsx")) {
    throw new FinfluxImportError("Upload a .csv or .xlsx file.");
  }

  try {
    let headers: string[] | null = null;
    const dataRows: Array<{ rowNumber: number; values: string[] }> = [];
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
      for await (const row of worksheet) {
        const values: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
          values[columnNumber - 1] = cellText(cell.value);
        });
        if (!headers) {
          headers = values;
          getColumnIndexes(headers);
          continue;
        }
        if (values.some((value) => value?.trim())) {
          dataRows.push({ rowNumber: row.number, values });
          if (dataRows.length > MAX_RECORDS) {
            throw new FinfluxImportError(
              `The file contains more than ${MAX_RECORDS} rows. Split it into smaller files and upload again.`,
            );
          }
        }
      }
      break;
    }

    if (!headers) {
      throw new FinfluxImportError("The Excel workbook is empty.");
    }
    return buildPreviewWithHeaders(fileName, headers, dataRows);
  } catch (error) {
    if (error instanceof FinfluxImportError) throw error;
    throw new FinfluxImportError(
      "The Excel workbook could not be read. Save it as .xlsx or upload a .csv file.",
    );
  }
}