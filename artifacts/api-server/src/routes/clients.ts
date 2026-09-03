import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  and,
  desc,
  ilike,
  inArray,
  isNull,
  isNotNull,
  or,
  sql,
  eq,
} from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import {
  ExportClientsQueryParams,
  ImportClientsBody,
  ImportClientsResponse,
  ListClientsQueryParams,
} from "@workspace/api-zod";
import type { ClientInput } from "@workspace/api-zod";

const router: IRouter = Router();

const LMS_HEADERS = [
  "loanid",
  "ClientID",
  "disbursedon_date",
  "Client_UID",
  "Client_VID",
  "Client_PAN",
  "ClientName",
  "mobile_no",
  "alternate_mobile_no",
  "Gender",
  "date_of_birth",
] as const;

const REQUIRED_LMS_VALUES = [
  "loanid",
  "ClientID",
  "disbursedon_date",
  "ClientName",
  "mobile_no",
  "Gender",
  "date_of_birth",
] as const;

type ClientExportRow = {
  clientId: string;
  loanid: string;
  clientName: string;
  ckycResponseId: string | null;
  ckycNumber: string | null;
  ckycResponseStatus: string | null;
  ckycResponseError: string | null;
};

function escapeCsv(value: string | null) {
  const raw = value ?? "";
  const spreadsheetSafe =
    /^\d+$/.test(raw) || /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

export function createClientsCsv(rows: ClientExportRow[]) {
  const header = [
    "LMS Client ID",
    "Loan ID",
    "Client Name",
    "CKYC Response ID",
    "Final CKYC Number",
    "Status",
    "Error",
  ];
  const body = rows.map((row) => [
    row.clientId,
    row.loanid,
    row.clientName,
    row.ckycResponseId,
    row.ckycNumber,
    row.ckycResponseStatus === "matched"
      ? "Matched"
      : row.ckycResponseStatus === "error"
        ? "Error"
        : "Awaiting response",
    row.ckycResponseError,
  ]);

  return `\uFEFF${[header, ...body]
    .map((columns) => columns.map(escapeCsv).join(","))
    .join("\r\n")}\r\n`;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function hasValue(value: string) {
  return value.trim().length > 0;
}

function isValidClientRow(row: ClientInput) {
  return REQUIRED_LMS_VALUES.every((header) => hasValue(row[header]));
}

function getImportIdentity(loanid: string, clientId: string) {
  return createHash("sha256")
    .update(JSON.stringify([loanid, clientId]))
    .digest("hex");
}

function toClientResponse(client: typeof clientsTable.$inferSelect) {
  return {
    id: client.id,
    loanid: client.loanid,
    ClientID: client.clientId,
    disbursedon_date: client.disbursedOnDate,
    Client_UID: client.clientUid,
    Client_VID: client.clientVid,
    Client_PAN: client.clientPan,
    ClientName: client.clientName,
    mobile_no: client.mobileNo,
    alternate_mobile_no: client.alternateMobileNo,
    Gender: client.gender,
    date_of_birth: client.dateOfBirth,
    createdAt: client.createdAt,
    ckycResponseId: client.ckycResponseId,
    ckycNumber: client.ckycNumber,
    ckycResponseStatus: client.ckycResponseStatus as "matched" | "error" | null,
    ckycResponseError: client.ckycResponseError,
    ckycResponseFileName: client.ckycResponseFileName,
    ckycResponseRequestId: client.ckycResponseRequestId,
    ckycResponseAt: client.ckycResponseAt,
  };
}

function getSearchFilter(search?: string) {
  return search
    ? or(
        ilike(clientsTable.loanid, `%${search}%`),
        ilike(clientsTable.clientId, `%${search}%`),
        ilike(clientsTable.clientName, `%${search}%`),
        ilike(clientsTable.clientUid, `%${search}%`),
        ilike(clientsTable.clientVid, `%${search}%`),
        ilike(clientsTable.mobileNo, `%${search}%`),
      )
    : undefined;
}

function getStatusFilter(status?: string) {
  switch (status) {
    case "matched":
      return isNotNull(clientsTable.ckycResponseId);
    case "error":
      return and(
        isNull(clientsTable.ckycResponseId),
        eq(clientsTable.ckycResponseStatus, "error"),
      );
    case "awaiting":
      return and(
        isNull(clientsTable.ckycResponseId),
        isNull(clientsTable.ckycResponseStatus),
      );
    default:
      return undefined;
  }
}

function getClientFilter(search?: string, status?: string) {
  const searchFilter = getSearchFilter(search);
  const statusFilter = getStatusFilter(status);
  return searchFilter && statusFilter
    ? and(searchFilter, statusFilter)
    : searchFilter ?? statusFilter;
}

router.get("/clients", async (req, res): Promise<void> => {
  const parsed = ListClientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, status, page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;
  const filter = getClientFilter(search, status);

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(clientsTable)
      .where(filter)
      .orderBy(desc(clientsTable.createdAt), desc(clientsTable.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(clientsTable)
      .where(filter),
  ]);

  res.json({
    items: rows.map(toClientResponse),
    total: Number(countRows[0]?.count ?? 0),
    page,
    pageSize,
  });
});

router.get("/clients/export", async (req, res): Promise<void> => {
  const parsed = ExportClientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, status } = parsed.data;
  const filter = getClientFilter(search, status);
  const rows = await db
    .select({
      clientId: clientsTable.clientId,
      loanid: clientsTable.loanid,
      clientName: clientsTable.clientName,
      ckycResponseId: clientsTable.ckycResponseId,
      ckycNumber: clientsTable.ckycNumber,
      ckycResponseStatus: clientsTable.ckycResponseStatus,
      ckycResponseError: clientsTable.ckycResponseError,
    })
    .from(clientsTable)
    .where(filter)
    .orderBy(desc(clientsTable.createdAt), desc(clientsTable.id));

  const date = new Date().toISOString().slice(0, 10);
  res
    .status(200)
    .set({
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="ckyc-client-results-${date}.csv"`,
    })
    .send(createClientsCsv(rows));
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = ImportClientsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sourceFileName = parsed.data.fileName ?? null;
  const normalizedHeaders = parsed.data.headers?.map((header) => header.trim());
  const missingHeaders = normalizedHeaders
    ? LMS_HEADERS.filter((header) => !normalizedHeaders.includes(header))
    : [];
  const validRows =
    missingHeaders.length > 0 ? [] : parsed.data.rows.filter(isValidClientRow);
  const values = validRows.map((row) => ({
    loanid: row.loanid,
    clientId: row.ClientID,
    disbursedOnDate: row.disbursedon_date,
    clientUid: row.Client_UID,
    clientVid: row.Client_VID,
    clientPan: row.Client_PAN,
    clientName: normalizeName(row.ClientName),
    mobileNo: row.mobile_no,
    alternateMobileNo: row.alternate_mobile_no,
    gender: row.Gender,
    dateOfBirth: row.date_of_birth,
    sourceFileName,
    importIdentity: getImportIdentity(row.loanid, row.ClientID),
  }));

  const existingIdentities = new Set<string>();
  const loanIds = [...new Set(values.map((value) => value.loanid))];
  for (let index = 0; index < loanIds.length; index += 500) {
    const existingRows = await db
      .select({
        loanid: clientsTable.loanid,
        clientId: clientsTable.clientId,
      })
      .from(clientsTable)
      .where(inArray(clientsTable.loanid, loanIds.slice(index, index + 500)));
    for (const row of existingRows) {
      existingIdentities.add(getImportIdentity(row.loanid, row.clientId));
    }
  }
  const newValues = values.filter(
    (value) => !existingIdentities.has(value.importIdentity),
  );

  let imported = 0;
  for (let index = 0; index < newValues.length; index += 500) {
    const inserted = await db
      .insert(clientsTable)
      .values(newValues.slice(index, index + 500))
      .onConflictDoNothing({
        target: clientsTable.importIdentity,
      })
      .returning({ id: clientsTable.id });
    imported += inserted.length;
  }

  res.status(201).json(
    ImportClientsResponse.parse({
      imported,
      skipped: parsed.data.rows.length - values.length,
      duplicates: values.length - imported,
      fileName: sourceFileName,
    }),
  );
});

export default router;