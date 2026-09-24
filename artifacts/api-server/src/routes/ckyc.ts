import { Router, type IRouter } from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, ckycRequestsTable, clientsTable } from "@workspace/db";
import {
  GenerateCkycRequestBody,
  GenerateCkycRequestResponse,
  GetCkycRequestParams,
  GetCkycRequestResponse,
  ListCkycRequestsResponse,
  UploadCkycResponseBody,
  UploadCkycResponseParams,
  UploadCkycResponseResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const MAX_CKYC_SEARCH_ROWS = 1_000_000;

type ClientMapping = {
  sequence: number;
  clientId: number;
};

type RequestRow = {
  sequence: number;
  searchType: string;
  searchValue: string;
  name: string;
  dateOfBirth: string;
  gender: string;
  line: string;
};

type ResponseRecord = {
  sequence: number;
  responseId: string | null;
  error: string | null;
  line: string;
};

function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function cleanIdentifier(value: string) {
  return value.trim().replace(/^'/, "");
}

function normalizeCkycDate(value: string) {
  const date = value.trim();
  const isoDate = date.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (isoDate) {
    return `${isoDate[3]}-${isoDate[2]}-${isoDate[1]}`;
  }

  const slashDate = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashDate) {
    return `${slashDate[1]}-${slashDate[2]}-${slashDate[3]}`;
  }

  return date;
}

function parseClientMapping(value: string | null): ClientMapping[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is ClientMapping =>
        typeof item === "object" &&
        item !== null &&
        Number.isInteger((item as ClientMapping).sequence) &&
        Number.isInteger((item as ClientMapping).clientId),
    );
  } catch {
    return [];
  }
}

function parseRequestRows(content: string) {
  const lines = content.split(/\r?\n/).filter(Boolean);
  return lines
    .slice(1)
    .map((line) => ({ line, fields: line.split("|") }))
    .filter(({ fields }) => fields[0] === "20")
    .map(({ line, fields }) => ({
      sequence: Number(fields[1]),
      searchType: fields[2],
      searchValue: fields[3]?.trim() ?? "",
      name: normalizeName(fields[4] ?? "").toLowerCase(),
      dateOfBirth: fields[5]?.trim() ?? "",
      gender: fields[6]?.trim().toUpperCase() ?? "",
      line,
    }))
    .filter((row) => Number.isInteger(row.sequence));
}

function getMatchedBy(
  row: RequestRow | undefined,
  client: typeof clientsTable.$inferSelect | undefined,
) {
  if (!row || !client) return null;
  if (row.searchType === "E") return "Matched by UID";
  if (row.searchType !== "B") return null;

  const searchValue = cleanIdentifier(row.searchValue);
  if (searchValue && searchValue === cleanIdentifier(client.clientVid)) {
    return "Match by VID";
  }
  if (searchValue && searchValue === cleanIdentifier(client.clientPan)) {
    return "Matched by PAN";
  }
  return null;
}

function deriveLegacyMapping(
  content: string,
  clients: Array<typeof clientsTable.$inferSelect>,
): ClientMapping[] {
  const occurrenceBySearch = new Map<string, number>();

  return parseRequestRows(content).flatMap((row) => {
    const candidates = clients.filter((candidate) => {
      if (row.searchType === "B") {
        return [candidate.clientVid, candidate.clientPan]
          .map(cleanIdentifier)
          .includes(row.searchValue);
      }

      const aadhaarDigits = cleanIdentifier(candidate.clientUid).replace(/\D/g, "");
      return (
        aadhaarDigits.slice(-4).padStart(4, "0") === row.searchValue &&
        normalizeName(candidate.clientName).toLowerCase() === row.name &&
        normalizeCkycDate(candidate.dateOfBirth) ===
          normalizeCkycDate(row.dateOfBirth) &&
        candidate.gender.trim().toUpperCase() === row.gender
      );
    });
    const searchKey = `${row.searchType}\u0000${row.searchValue}`;
    const occurrence = occurrenceBySearch.get(searchKey) ?? 0;
    occurrenceBySearch.set(searchKey, occurrence + 1);
    const client = candidates.sort((left, right) => left.id - right.id)[occurrence];

    return client ? [{ sequence: row.sequence, clientId: client.id }] : [];
  });
}

function parseResponseRecords(content: string): ResponseRecord[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (!lines.length || lines[0].split("|")[0] !== "10") {
    throw new Error("The uploaded file does not have a valid type 10 header.");
  }

  const records = lines.slice(1).flatMap((line) => {
    const fields = line.split("|");
    const sequence = Number(fields[1]);
    if (fields[0] !== "20" || !Number.isInteger(sequence)) return [];

    const responseId = fields[4]?.trim() || null;
    const error =
      responseId === null
        ? fields.slice(5).find((field) => field.trim().length > 0)?.trim() ??
          "CKYC did not return a response ID."
        : null;
    return [{ sequence, responseId, error, line }];
  });

  if (!records.length) {
    throw new Error("The uploaded file does not contain any type 20 response rows.");
  }
  return records;
}

function toRequestResponse(
  request: typeof ckycRequestsTable.$inferSelect,
  includeContent = false,
) {
  const base = {
    id: request.id,
    fileName: request.fileName,
    recordCount: request.recordCount,
    status: request.status as "generated" | "response_uploaded",
    createdAt: request.createdAt,
    responseFileName: request.responseFileName,
  };

  if (!includeContent) {
    return base;
  }

  return {
    ...base,
    content: request.content,
    responseContent: request.responseContent,
  };
}

export function createCkycContent(data: {
  institutionCode: string;
  version: string;
  fileDate: string;
  rowCount: string;
  clients: Array<{
    name: string;
    dateOfBirth: string;
    gender: string;
    searchType: "E" | "B";
    searchValue: string;
    sequence: number;
  }>;
}) {
  const compactDate = data.fileDate.replace(/\D/g, "");
  const headerDate =
    compactDate.length === 8
      ? `${compactDate.slice(0, 2)}-${compactDate.slice(2, 4)}-${compactDate.slice(4)}`
      : data.fileDate.trim();
  const header = [
    "10",
    data.institutionCode,
    "1",
    String(data.clients.length),
    data.version,
    headerDate,
    "",
    "",
    "",
    "",
  ].join("|");

  const rows = data.clients.map((client) => {
    if (client.searchType === "B") {
      return `20|${client.sequence}|B|${client.searchValue}||||`;
    }
      return `20|${client.sequence}|E|${client.searchValue}|${normalizeName(client.name)}|${normalizeCkycDate(client.dateOfBirth)}|${client.gender}|`;
  });

  return `${[header, ...rows].join("\r\n")}\r\n`;
}

router.get("/ckyc/requests", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(ckycRequestsTable)
    .orderBy(desc(ckycRequestsTable.createdAt), desc(ckycRequestsTable.id))
    .limit(100);

  res.json(ListCkycRequestsResponse.parse(rows.map((row) => toRequestResponse(row))));
});

router.post("/ckyc/requests", async (req, res): Promise<void> => {
  const parsed = GenerateCkycRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
  const requestedClientIds = [...new Set(data.clients.map((client) => client.clientId))];
  const requestedClients: Array<{
    id: number;
    responseStatus: string | null;
    responseId: string | null;
    ckycNumber: string | null;
  }> = [];
  for (let index = 0; index < requestedClientIds.length; index += 500) {
    const chunk = await db
      .select({
        id: clientsTable.id,
        responseStatus: clientsTable.ckycResponseStatus,
        responseId: clientsTable.ckycResponseId,
        ckycNumber: clientsTable.ckycNumber,
      })
      .from(clientsTable)
      .where(inArray(clientsTable.id, requestedClientIds.slice(index, index + 500)));
    requestedClients.push(...chunk);
  }
  const eligibleClientIds = new Set(
    requestedClients
      .filter(
        (client) =>
          client.responseId === null &&
          client.ckycNumber === null &&
          (client.responseStatus === null ||
            (data.reprocessPending && client.responseStatus === "error")),
      )
      .map((client) => client.id),
  );
  const eligibleRows = data.clients
    .filter((client) => eligibleClientIds.has(client.clientId))
    .map((client, index) => ({ ...client, sequence: index + 1 }));

  if (!eligibleRows.length) {
    res.status(400).json({
      error:
        data.reprocessPending
          ? "No pending clients without a CKYC response ID were selected."
          : "No new clients are available. Enable reprocessing to include clients with previous errors.",
    });
    return;
  }
  if (eligibleRows.length > MAX_CKYC_SEARCH_ROWS) {
    res.status(400).json({
      error:
        "CERSAI allows a maximum of 10 lakh CKYC rows per search file. Split the selection into smaller files.",
    });
    return;
  }

  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(10001)`);
    const existingFiles = await tx
      .select({ fileName: ckycRequestsTable.fileName })
      .from(ckycRequestsTable);
    const highestSerial = existingFiles.reduce((highest, request) => {
      const match = request.fileName.match(/_S(\d+)\.txt$/i);
      const serial = match ? Number(match[1]) : 0;
      return Number.isSafeInteger(serial) ? Math.max(highest, serial) : highest;
    }, 10000);
    const fileSerial = String(highestSerial + 1).padStart(5, "0");

    const [pending] = await tx
      .insert(ckycRequestsTable)
      .values({
        fileName: "pending.txt",
        content: "pending",
        recordCount: eligibleRows.length,
        status: "generated",
        clientMapping: JSON.stringify(
          eligibleRows.map((client) => ({
            sequence: client.sequence,
            clientId: client.clientId,
          })),
        ),
      })
      .returning();

    const fileName = `${data.institutionCode}_${data.fileDate}_${data.version}_S${fileSerial}.txt`;
    const content = createCkycContent({
      ...data,
      rowCount: String(eligibleRows.length),
      clients: eligibleRows,
    });
    const [updated] = await tx
      .update(ckycRequestsTable)
      .set({ fileName, content })
      .where(eq(ckycRequestsTable.id, pending.id))
      .returning();

    return { ...updated, content };
  });

  res.status(201).json(
    GenerateCkycRequestResponse.parse({
      ...toRequestResponse(created),
      content: created.content,
    }),
  );
});

router.get("/ckyc/requests/:id", async (req, res): Promise<void> => {
  const parsed = GetCkycRequestParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [request] = await db
    .select()
    .from(ckycRequestsTable)
    .where(eq(ckycRequestsTable.id, parsed.data.id));

  if (!request) {
    res.status(404).json({ error: "CKYC request not found" });
    return;
  }

  res.json(GetCkycRequestResponse.parse(toRequestResponse(request, true)));
});

router.post("/ckyc/requests/:id/response", async (req, res): Promise<void> => {
  const params = UploadCkycResponseParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UploadCkycResponseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [request] = await db
    .select()
    .from(ckycRequestsTable)
    .where(eq(ckycRequestsTable.id, params.data.id));
  if (!request) {
    res.status(404).json({ error: "CKYC request not found" });
    return;
  }

  let responseRecords: ResponseRecord[];
  try {
    responseRecords = parseResponseRecords(parsed.data.content);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid CKYC response file.",
    });
    return;
  }

  let clientMapping = parseClientMapping(request.clientMapping);
  if (!clientMapping.length) {
    const clients = await db.select().from(clientsTable);
    clientMapping = deriveLegacyMapping(request.content, clients);
  }

  const requestRowsBySequence = new Map(
    parseRequestRows(request.content).map((row) => [row.sequence, row]),
  );
  const clientsById = new Map<number, typeof clientsTable.$inferSelect>();
  const mappedClientIds = [...new Set(clientMapping.map((mapping) => mapping.clientId))];
  for (let index = 0; index < mappedClientIds.length; index += 500) {
    const rows = await db
      .select()
      .from(clientsTable)
      .where(inArray(clientsTable.id, mappedClientIds.slice(index, index + 500)));
    for (const client of rows) clientsById.set(client.id, client);
  }

  const recordsBySequence = new Map(
    responseRecords.map((record) => [record.sequence, record]),
  );
  const resultsByClient = new Map<
    number,
    Array<{ record: ResponseRecord; requestRow: RequestRow | undefined }>
  >();
  for (const mapping of clientMapping) {
    const existing = resultsByClient.get(mapping.clientId) ?? [];
    existing.push(
      {
        record:
          recordsBySequence.get(mapping.sequence) ?? {
            sequence: mapping.sequence,
            responseId: null,
            error: "No response record was found in the uploaded file.",
              line: "",
          },
        requestRow: requestRowsBySequence.get(mapping.sequence),
      },
    );
    resultsByClient.set(mapping.clientId, existing);
  }

  const updated = await db.transaction(async (tx) => {
    const now = new Date();
    for (const [clientId, results] of resultsByClient) {
      const ordered = [...results].sort(
        (left, right) => left.record.sequence - right.record.sequence,
      );
      const matched = ordered.find((result) => result.record.responseId !== null);
      const sourceResult = matched ?? ordered[0];
      const matchedBy = getMatchedBy(
        sourceResult?.requestRow,
        clientsById.get(clientId),
      );
      const requestLine = sourceResult?.requestRow?.line ?? null;
      const responseLine = sourceResult?.record.line || null;

      if (matched?.record.responseId) {
        await tx
          .update(clientsTable)
          .set({
            ckycResponseId: matched.record.responseId,
            ckycResponseStatus: "matched",
            ckycResponseError: null,
            ckycResponseMatchedBy: matchedBy,
            ckycResponseRequestLine: requestLine,
            ckycResponseMatchedRow: responseLine,
            ckycResponseFileName: parsed.data.fileName,
            ckycResponseRequestId: request.id,
            ckycResponseAt: now,
          })
          .where(eq(clientsTable.id, clientId));
        continue;
      }

      const [client] = await tx
        .select({ responseId: clientsTable.ckycResponseId })
        .from(clientsTable)
        .where(eq(clientsTable.id, clientId));
      if (client?.responseId) continue;

      const errors = [
        ...new Set(
          ordered.map((result) => result.record.error).filter(Boolean),
        ),
      ];
      await tx
        .update(clientsTable)
        .set({
          ckycResponseStatus: "error",
          ckycResponseError: errors.join(" · ") || "CKYC did not return a response ID.",
          ckycResponseMatchedBy: matchedBy,
          ckycResponseRequestLine: requestLine,
          ckycResponseMatchedRow: responseLine,
          ckycResponseFileName: parsed.data.fileName,
          ckycResponseRequestId: request.id,
          ckycResponseAt: now,
        })
        .where(eq(clientsTable.id, clientId));
    }

    const [saved] = await tx
      .update(ckycRequestsTable)
      .set({
        responseFileName: parsed.data.fileName,
        responseContent: parsed.data.content,
        status: "response_uploaded",
      })
      .where(eq(ckycRequestsTable.id, params.data.id))
      .returning();
    return saved;
  });

  res.json(
    UploadCkycResponseResponse.parse(toRequestResponse(updated, true)),
  );
});

export default router;