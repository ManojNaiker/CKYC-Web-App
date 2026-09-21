import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import ExcelJS from "exceljs";
import {
  and,
  desc,
  eq,
  inArray,
  ilike,
  or,
  sql,
} from "drizzle-orm";
import {
  ImportCkycCreateDataBody,
  ListCkycCreateDataBatchesResponse,
  ListCkycCreateDataQueryParams,
  ListCkycCreateDataResponse,
} from "@workspace/api-zod";
import {
  ckycCreateDataImportsTable,
  ckycCreateDataTable,
  clientsTable,
  db,
} from "@workspace/db";

const router: IRouter = Router();
const INSERT_BATCH_SIZE = 5_000;

type ParsedRow = {
  refId: string;
  clientId: string;
  transactionDate: string | null;
  uploadedCkycNumber: string | null;
  referenceNumber: string | null;
  status: string;
  reason: string | null;
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

function normalizeCell(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function escapeCsv(value: string | null | undefined) {
  const raw = value ?? "";
  const spreadsheetSafe =
    /^\d+$/.test(raw) || /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

function findColumn(headers: string[], aliases: string[]) {
  const aliasSet = new Set(aliases.map(normalizeHeader));
  const index = headers.findIndex((header) => aliasSet.has(header));
  return index === -1 ? null : index;
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const next = line[index + 1];
    if (character === '"' && quoted && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      values.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value);
  return values;
}

function parseClientIdFromRefId(refId: string, explicitClientId: string | null) {
  if (explicitClientId) {
    return { clientId: explicitClientId, transactionDate: null };
  }

  const match = refId.match(
    /^uploadMFITransactionId(\d{8})\*?([A-Za-z0-9]+)\*?$/i,
  );
  if (!match) return { clientId: null, transactionDate: null };
  return { clientId: match[2], transactionDate: match[1] };
}

function buildParsedRow(
  values: string[],
  columns: {
    refId: number;
    clientId: number | null;
    ckycNumber: number | null;
    referenceNumber: number | null;
    status: number;
    reason: number | null;
  },
): ParsedRow | null {
  const refId = values[columns.refId]?.trim() ?? "";
  if (!refId) return null;

  const explicitClientId = columns.clientId === null
    ? null
    : normalizeCell(values[columns.clientId] ?? "");
  const parsedClient = parseClientIdFromRefId(refId, explicitClientId);
  if (!parsedClient.clientId) return null;

  return {
    refId,
    clientId: parsedClient.clientId,
    transactionDate: parsedClient.transactionDate,
    uploadedCkycNumber:
      columns.ckycNumber === null
        ? null
        : normalizeCell(values[columns.ckycNumber] ?? ""),
    referenceNumber:
      columns.referenceNumber === null
        ? null
        : normalizeCell(values[columns.referenceNumber] ?? ""),
    status: values[columns.status]?.trim() || "unknown",
    reason:
      columns.reason === null
        ? null
        : normalizeCell(values[columns.reason] ?? ""),
  };
}

function resolveColumns(headers: string[]) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const columns = {
    refId: findColumn(normalizedHeaders, [
      "REF ID",
      "REFID",
      "REFERENCE ID",
    ]),
    clientId: findColumn(normalizedHeaders, ["CLIENT ID", "CLIENTID"]),
    ckycNumber: findColumn(normalizedHeaders, [
      "CKYC NO",
      "CKYC NUMBER",
      "FINAL CKYC",
      "FINAL CKYC NUMBER",
      "CKYC",
    ]),
    referenceNumber: findColumn(normalizedHeaders, [
      "REF NO",
      "REFERENCE NO",
      "REFERENCE NUMBER",
    ]),
    status: findColumn(normalizedHeaders, ["STATUS"]),
    reason: findColumn(normalizedHeaders, ["REASON"]),
  };

  if (columns.refId === null || columns.status === null) {
    throw new Error('The file must contain "ref ID" and "status" columns.');
  }
  return columns as {
    refId: number;
    clientId: number | null;
    ckycNumber: number | null;
    referenceNumber: number | null;
    status: number;
    reason: number | null;
  };
}

async function parseCreateDataFile(
  fileContentBase64: string,
  sourceFileName: string,
) {
  const buffer = Buffer.from(fileContentBase64, "base64");
  const rows: ParsedRow[] = [];
  let skipped = 0;

  const consumeRows = (headers: string[], dataRows: string[][]) => {
    const columns = resolveColumns(headers);
    for (const values of dataRows) {
      const parsed = buildParsedRow(values, columns);
      if (parsed) rows.push(parsed);
      else if (values.some((value) => value.trim())) skipped += 1;
    }
  };

  if (sourceFileName.toLowerCase().endsWith(".csv")) {
    const lines = buffer
      .toString("utf8")
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim());
    if (!lines.length) throw new Error("The uploaded CSV file is empty.");
    consumeRows(
      parseCsvLine(lines[0]),
      lines.slice(1).map(parseCsvLine),
    );
  } else {
    let worksheetFound = false;
    let headers: string[] | null = null;
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
        for await (const row of worksheet) {
          const values: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
            values[columnNumber - 1] = cellText(cell.value);
          });
          if (!headers) {
            headers = values;
            resolveColumns(headers);
            continue;
          }
          const columns = resolveColumns(headers);
          const parsed = buildParsedRow(values, columns);
          if (parsed) rows.push(parsed);
          else if (values.some((value) => value?.trim())) skipped += 1;
        }
        break;
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("columns")) {
        throw error;
      }
      throw new Error("The uploaded file is not a readable Excel workbook.");
    }
    if (!worksheetFound) throw new Error("The Excel workbook is empty.");
  }

  if (!rows.length) {
    throw new Error(
      "No valid CKYC Create rows were found. Check ref ID values and the required columns.",
    );
  }
  return { rows, skipped };
}

function toResponse(
  row: typeof ckycCreateDataTable.$inferSelect,
  client: {
    id: number;
    clientName: string;
    ckycNumber: string | null;
  } | null,
) {
  return {
    id: row.id,
    importId: row.importId,
    sourceFileName: row.sourceFileName,
    refId: row.refId,
    clientId: row.clientId,
    transactionDate: row.transactionDate,
    uploadedCkycNumber: row.uploadedCkycNumber,
    referenceNumber: row.referenceNumber,
    status: row.status,
    reason: row.reason,
    clientName: client?.clientName ?? null,
    finalCkycNumber: client?.ckycNumber ?? null,
    clientRecordId: client?.id ?? null,
    matchStatus: client ? "matched" : "unmatched",
    createdAt: row.createdAt,
  };
}

function getBatchReportStatus(matchedCount: number, unmatchedCount: number) {
  if (unmatchedCount === 0) return "matched" as const;
  if (matchedCount === 0) return "unmatched" as const;
  return "partially_matched" as const;
}

router.get("/ckyc/create-data/batches", async (_req, res): Promise<void> => {
  const batches = await db
    .select({
      id: ckycCreateDataImportsTable.id,
      sourceFileName: ckycCreateDataImportsTable.sourceFileName,
      createdAt: ckycCreateDataImportsTable.createdAt,
      uploadedCount: sql<number>`count(distinct ${ckycCreateDataTable.id})`,
      matchedCount: sql<number>`count(distinct case when ${clientsTable.id} is not null then ${ckycCreateDataTable.id} end)`,
      unmatchedCount: sql<number>`count(distinct case when ${clientsTable.id} is null then ${ckycCreateDataTable.id} end)`,
      successCount: sql<number>`count(distinct case when lower(${ckycCreateDataTable.status}) = 'success' then ${ckycCreateDataTable.id} end)`,
      probableMatchCount: sql<number>`count(distinct case when lower(${ckycCreateDataTable.status}) = 'probable_match' then ${ckycCreateDataTable.id} end)`,
      rejectCount: sql<number>`count(distinct case when lower(${ckycCreateDataTable.status}) in ('short_reject', 'reject', 'rejected') then ${ckycCreateDataTable.id} end)`,
    })
    .from(ckycCreateDataImportsTable)
    .leftJoin(
      ckycCreateDataTable,
      eq(ckycCreateDataImportsTable.id, ckycCreateDataTable.importId),
    )
    .leftJoin(
      clientsTable,
      eq(ckycCreateDataTable.clientId, clientsTable.clientId),
    )
    .groupBy(
      ckycCreateDataImportsTable.id,
      ckycCreateDataImportsTable.sourceFileName,
      ckycCreateDataImportsTable.createdAt,
    )
    .orderBy(
      desc(ckycCreateDataImportsTable.createdAt),
      desc(ckycCreateDataImportsTable.id),
    );

  res.json(
    ListCkycCreateDataBatchesResponse.parse(
      batches.map((batch) => {
        const uploadedCount = Number(batch.uploadedCount ?? 0);
        const matchedCount = Number(batch.matchedCount ?? 0);
        const unmatchedCount = Number(batch.unmatchedCount ?? 0);
        return {
          id: batch.id,
          sourceFileName: batch.sourceFileName,
          uploadedCount,
          matchedCount,
          unmatchedCount,
          successCount: Number(batch.successCount ?? 0),
          probableMatchCount: Number(batch.probableMatchCount ?? 0),
          rejectCount: Number(batch.rejectCount ?? 0),
          reportStatus: getBatchReportStatus(matchedCount, unmatchedCount),
          createdAt: batch.createdAt,
        };
      }),
    ),
  );
});

router.get("/ckyc/create-data/export", async (req, res): Promise<void> => {
  const importId = Number(req.query.importId);
  if (!Number.isInteger(importId) || importId < 1) {
    res.status(400).json({ error: "A valid importId is required." });
    return;
  }

  const [batch] = await db
    .select({
      id: ckycCreateDataImportsTable.id,
      sourceFileName: ckycCreateDataImportsTable.sourceFileName,
    })
    .from(ckycCreateDataImportsTable)
    .where(eq(ckycCreateDataImportsTable.id, importId))
    .limit(1);

  if (!batch) {
    res.status(404).json({ error: "Import batch not found." });
    return;
  }

  const rows = await db
    .select({ row: ckycCreateDataTable })
    .from(ckycCreateDataTable)
    .where(eq(ckycCreateDataTable.importId, importId))
    .orderBy(ckycCreateDataTable.id);

  const clientIds = [...new Set(rows.map(({ row }) => row.clientId))];
  const clientsById = new Map<
    string,
    { clientName: string; ckycNumber: string | null }
  >();
  for (let index = 0; index < clientIds.length; index += 500) {
    const clients = await db
      .select({
        clientId: clientsTable.clientId,
        clientName: clientsTable.clientName,
        ckycNumber: clientsTable.ckycNumber,
      })
      .from(clientsTable)
      .where(inArray(clientsTable.clientId, clientIds.slice(index, index + 500)));
    for (const client of clients) {
      if (!clientsById.has(client.clientId)) {
        clientsById.set(client.clientId, {
          clientName: client.clientName,
          ckycNumber: client.ckycNumber,
        });
      }
    }
  }

  const header = [
    "Source file",
    "Client ID",
    "Ref ID",
    "LMS client name",
    "Existing Final CKYC",
    "Uploaded CKYC No",
    "Reference No",
    "Portal status",
    "Reason",
    "LMS match status",
  ];
  const body = rows.map(({ row }) => {
    const client = clientsById.get(row.clientId);
    return [
      row.sourceFileName,
      row.clientId,
      row.refId,
      client?.clientName ?? "",
      client?.ckycNumber ?? "",
      row.uploadedCkycNumber,
      row.referenceNumber,
      row.status,
      row.reason,
      client ? "matched" : "unmatched",
    ];
  });
  const csv = `\uFEFF${[header, ...body]
    .map((columns) => columns.map(escapeCsv).join(","))
    .join("\r\n")}\r\n`;
  const safeFileName = batch.sourceFileName
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_");

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="ckyc-create-${safeFileName || importId}-report.csv"`,
  );
  res.send(csv);
});

router.get("/ckyc/create-data", async (req, res): Promise<void> => {
  const parsed = ListCkycCreateDataQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, status, importId, page, pageSize } = parsed.data;
  const filters = [];
  if (importId) {
    filters.push(eq(ckycCreateDataTable.importId, importId));
  }
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    filters.push(
      or(
        ilike(ckycCreateDataTable.clientId, term),
        ilike(ckycCreateDataTable.refId, term),
        ilike(ckycCreateDataTable.referenceNumber, term),
        ilike(ckycCreateDataTable.sourceFileName, term),
        ilike(clientsTable.clientName, term),
      ),
    );
  }
  if (status?.trim()) {
    filters.push(ilike(ckycCreateDataTable.status, status.trim()));
  }
  const where = filters.length ? and(...filters) : undefined;

  const [countRow, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(ckycCreateDataTable)
      .leftJoin(
        clientsTable,
        eq(ckycCreateDataTable.clientId, clientsTable.clientId),
      )
      .where(where),
    db
      .select({
        row: ckycCreateDataTable,
        client: {
          id: clientsTable.id,
          clientName: clientsTable.clientName,
          ckycNumber: clientsTable.ckycNumber,
        },
      })
      .from(ckycCreateDataTable)
      .leftJoin(
        clientsTable,
        eq(ckycCreateDataTable.clientId, clientsTable.clientId),
      )
      .where(where)
      .orderBy(desc(ckycCreateDataTable.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
  ]);

  res.json(
    ListCkycCreateDataResponse.parse({
      items: rows.map(({ row, client }) => toResponse(row, client)),
      total: Number(countRow[0]?.count ?? 0),
      page,
      pageSize,
    }),
  );
});

router.post("/ckyc/create-data", async (req, res): Promise<void> => {
  const parsed = ImportCkycCreateDataBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sourceFileName = parsed.data.sourceFileName.trim();
  if (!sourceFileName) {
    res.status(400).json({ error: "A source file name is required." });
    return;
  }

  let parsedFile: Awaited<ReturnType<typeof parseCreateDataFile>>;
  try {
    parsedFile = await parseCreateDataFile(
      parsed.data.fileContentBase64,
      sourceFileName,
    );
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid CKYC Create file.",
    });
    return;
  }

  const saved = await db.transaction(async (tx) => {
    const [imported] = await tx
      .insert(ckycCreateDataImportsTable)
      .values({
        sourceFileName,
        rowCount: parsedFile.rows.length,
      })
      .returning();

    for (
      let index = 0;
      index < parsedFile.rows.length;
      index += INSERT_BATCH_SIZE
    ) {
      await tx.insert(ckycCreateDataTable).values(
        parsedFile.rows
          .slice(index, index + INSERT_BATCH_SIZE)
          .map((row) => ({
            importId: imported.id,
            sourceFileName,
            ...row,
          })),
      );
    }
    return imported;
  });

  const uniqueClientIds = [...new Set(parsedFile.rows.map((row) => row.clientId))];
  const matchedClientIds = new Set<string>();
  for (let index = 0; index < uniqueClientIds.length; index += 500) {
    const chunk = uniqueClientIds.slice(index, index + 500);
    const matched = await db
      .select({ clientId: clientsTable.clientId })
      .from(clientsTable)
      .where(inArray(clientsTable.clientId, chunk));
    matched.forEach((client) => matchedClientIds.add(client.clientId));
  }

  res.status(201).json({
    importId: saved.id,
    sourceFileName,
    imported: parsedFile.rows.length,
    skipped: parsedFile.skipped,
    unmatchedClientIds: uniqueClientIds.filter(
      (clientId) => !matchedClientIds.has(clientId),
    ),
  });
});

export default router;