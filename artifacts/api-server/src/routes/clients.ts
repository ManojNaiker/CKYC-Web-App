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
import { ckycCreateDataTable, db, clientsTable } from "@workspace/db";
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
  clientUid: string;
  clientVid: string;
  clientPan: string;
  gender: string;
  disbursedOnDate: string;
  ckycResponseId: string | null;
  ckycNumber: string | null;
  ckycResponseStatus: string | null;
  ckycResponseError: string | null;
  ckycResponseMatchedBy: string | null;
  ckycResponseRequestLine: string | null;
  ckycResponseMatchedRow: string | null;
  ckycCreateMatched?: boolean;
};

export type CkycResponseMatchStatus =
  | "Properly Match"
  | "Match"
  | "Match via Create CKYC"
  | "Not Match";

function formatReportDate(value: string) {
  const normalized = value.trim();
  const isoDate = normalized.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (isoDate) return `${isoDate[3]}-${isoDate[2]}-${isoDate[1]}`;

  const slashDate = normalized.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDate) return `${slashDate[1]}-${slashDate[2]}-${slashDate[3]}`;

  return normalized;
}

function escapeCsv(value: string | null) {
  const raw = value ?? "";
  const spreadsheetSafe =
    /^\d+$/.test(raw) || /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${spreadsheetSafe.replaceAll('"', '""')}"`;
}

function normalizeNameForMatch(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function responseCustomerName(responseRow: string | null) {
  return responseRow?.split("|")[5]?.trim() ?? "";
}

function responseHasId(responseRow: string | null) {
  return Boolean(responseRow?.split("|")[4]?.trim());
}

function nameTokens(value: string) {
  return normalizeNameForMatch(value).split(" ").filter(Boolean);
}

function isUnknownNameToken(value: string) {
  return ["na", "n", "a", "unknown", "notavailable"].includes(value);
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] =
        left[leftIndex - 1] === right[rightIndex - 1]
          ? previous[rightIndex - 1]
          : Math.min(
              previous[rightIndex - 1] + 1,
              previous[rightIndex] + 1,
              current[rightIndex - 1] + 1,
            );
    }
    for (let index = 0; index < current.length; index += 1) {
      previous[index] = current[index];
    }
  }
  return previous[right.length];
}

function similarNameToken(left: string, right: string) {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;
  const minimumLength = Math.min(left.length, right.length);
  if (
    minimumLength >= 5 &&
    (left.includes(right) || right.includes(left))
  ) {
    return true;
  }
  const commonPrefixLength = left
    .split("")
    .findIndex((character, index) => character !== right[index]);
  const prefixLength =
    commonPrefixLength === -1 ? minimumLength : commonPrefixLength;
  if (
    (prefixLength >= 4 && prefixLength / minimumLength >= 0.5) ||
    (prefixLength >= 3 &&
      minimumLength <= 5 &&
      prefixLength / minimumLength >= 0.6)
  ) {
    return true;
  }
  if (
    minimumLength >= 4 &&
    (left.endsWith(right) || right.endsWith(left))
  ) {
    return true;
  }
  const distance = editDistance(left, right);
  return distance <= Math.max(1, Math.floor(Math.min(left.length, right.length) * 0.2));
}

export function getCkycResponseMatchStatus(
  clientName: string,
  responseRow: string | null,
  responseId: string | null,
): CkycResponseMatchStatus | null {
  if (!responseRow && !responseId) return null;
  if (!responseRow) return responseId ? "Match" : "Not Match";
  if (!responseHasId(responseRow)) return "Not Match";

  const responseName = normalizeNameForMatch(responseCustomerName(responseRow));
  if (!responseName) return "Match";

  const lmsTokens = nameTokens(clientName);
  const responseTokens = nameTokens(responseCustomerName(responseRow));
  const meaningfulResponseTokens = responseTokens.filter(
    (token) => !isUnknownNameToken(token),
  );
  const lmsCompact = lmsTokens.join("");
  const responseCompact = responseTokens.join("");
  const hasOnlyUnknownLmsSuffix =
    lmsTokens.length > 1 &&
    lmsTokens.slice(1).every(isUnknownNameToken);

  if (
    hasOnlyUnknownLmsSuffix &&
    meaningfulResponseTokens.length > 0
  ) {
    if (lmsTokens[0] === meaningfulResponseTokens[0]) {
      return "Properly Match";
    }
    return similarNameToken(lmsTokens[0], meaningfulResponseTokens[0])
      ? "Match"
      : "Not Match";
  }

  if (
    lmsTokens.length > 0 &&
    meaningfulResponseTokens.length === 1 &&
    lmsTokens.some(
      (token, index) =>
        index < lmsTokens.length - 1 &&
        similarNameToken(token, meaningfulResponseTokens[0]),
    )
  ) {
    return "Match";
  }

  if (lmsCompact === responseCompact) return "Properly Match";

  const exactTokenSetsMatch =
    lmsTokens.length === responseTokens.length &&
    [...lmsTokens].sort().join("|") === [...responseTokens].sort().join("|");
  if (exactTokenSetsMatch) return "Properly Match";

  const responseJoinedTokens = responseTokens.join("");
  const matchedLmsTokenIndexes = lmsTokens.flatMap((token, index) => {
    const tokenMatches = responseTokens.some((responseToken) =>
      similarNameToken(token, responseToken),
    );
    const joinedTokenMatches =
      token.length >= 5 && responseJoinedTokens.includes(token);
    return tokenMatches || joinedTokenMatches ? [index] : [];
  });
  const matchedLmsTokens = matchedLmsTokenIndexes.length;
  const coverage = lmsTokens.length ? matchedLmsTokens / lmsTokens.length : 0;
  const hasPrimaryNameEvidence =
    lmsTokens.length > 0 &&
    (matchedLmsTokenIndexes.includes(0) ||
      matchedLmsTokenIndexes.some((index) => index < lmsTokens.length - 1));

  if (
    coverage >= 1 ||
    (lmsTokens.length > 1 && coverage >= 0.66) ||
    hasPrimaryNameEvidence
  ) {
    return "Match";
  }
  return "Not Match";
}

export function createClientsCsv(rows: ClientExportRow[]) {
  const header = [
    "LMS Client ID",
    "Loan ID",
    "Client Name",
    "UID",
    "VID",
    "PAN",
    "Gender",
    "Disbursement Date",
    "CKYC Response ID",
    "Final CKYC Number",
    "Status",
    "Error",
    "CKYC Response Matched BY",
    "CKYC Response Match Status",
    "CKYC Request Matched Row",
    "CKYC Response Matched Row",
  ];
  const body = rows.map((row) => [
    row.clientId,
    row.loanid,
    row.clientName,
    row.clientUid,
    row.clientVid,
    row.clientPan,
    row.gender,
    formatReportDate(row.disbursedOnDate),
    row.ckycResponseId,
    row.ckycNumber,
    row.ckycResponseStatus === "matched"
      ? "Matched"
      : row.ckycResponseStatus === "error"
        ? "Error"
        : "Awaiting response",
    row.ckycResponseError,
    row.ckycResponseMatchedBy,
    getCkycResponseMatchStatus(
      row.clientName,
      row.ckycResponseMatchedRow,
      row.ckycResponseId,
    ),
    row.ckycResponseRequestLine,
    row.ckycResponseMatchedRow,
  ]);

  return `\uFEFF${[header, ...body]
    .map((columns) => columns.map(escapeCsv).join(","))
    .join("\r\n")}\r\n`;
}

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function maskUid(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";

  const digits = normalized.replace(/\D/g, "");
  const visibleSuffix = digits.slice(-4).padStart(4, "X");
  return `XXXXXXXX${visibleSuffix}`;
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
    ckycResponseMatchStatus: getCkycResponseMatchStatus(
      client.clientName,
      client.ckycResponseMatchedRow,
      client.ckycResponseId,
    ),
    mobile_no: client.mobileNo,
    alternate_mobile_no: client.alternateMobileNo,
    Gender: client.gender,
    date_of_birth: client.dateOfBirth,
    createdAt: client.createdAt,
    ckycResponseId: client.ckycResponseId,
    ckycNumber: client.ckycNumber,
    ckycResponseStatus: client.ckycResponseStatus as "matched" | "error" | null,
    ckycResponseError: client.ckycResponseError,
    ckycResponseMatchedBy: client.ckycResponseMatchedBy,
    ckycResponseRequestLine: client.ckycResponseRequestLine,
    ckycResponseMatchedRow: client.ckycResponseMatchedRow,
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
    case "pending":
      return isNull(clientsTable.ckycResponseId);
    default:
      return undefined;
  }
}

function getClientFilter(search?: string, status?: string, clientId?: number) {
  const searchFilter = getSearchFilter(search);
  const statusFilter = getStatusFilter(status);
  const clientIdFilter = clientId ? eq(clientsTable.id, clientId) : undefined;
  return and(searchFilter, statusFilter, clientIdFilter);
}

router.get("/clients", async (req, res): Promise<void> => {
  const parsed = ListClientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, status, clientId, page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;
  const filter = getClientFilter(search, status, clientId);

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
      clientUid: clientsTable.clientUid,
      clientVid: clientsTable.clientVid,
      clientPan: clientsTable.clientPan,
      gender: clientsTable.gender,
      disbursedOnDate: clientsTable.disbursedOnDate,
      ckycResponseId: clientsTable.ckycResponseId,
      ckycNumber: clientsTable.ckycNumber,
      ckycResponseStatus: clientsTable.ckycResponseStatus,
      ckycResponseError: clientsTable.ckycResponseError,
      ckycResponseMatchedBy: clientsTable.ckycResponseMatchedBy,
      ckycResponseRequestLine: clientsTable.ckycResponseRequestLine,
      ckycResponseMatchedRow: clientsTable.ckycResponseMatchedRow,
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
    clientUid: maskUid(row.Client_UID),
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