import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, ckycRequestsTable } from "@workspace/db";
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

function formatHeaderValue(documentSetName: string) {
  return documentSetName.replace(/^D/i, "");
}

function createCkycContent(data: {
  institutionCode: string;
  documentSetName: string;
  branchCode: string;
  clients: Array<{
    name: string;
    dateOfBirth: string;
    gender: string;
    searchType: "E" | "B";
    searchValue: string;
    sequence: number;
  }>;
}) {
  const header = [
    "10",
    formatHeaderValue(data.documentSetName),
    data.institutionCode,
    "1",
    "1BR",
    data.branchCode,
    "",
    "",
    "",
    "",
    "",
  ].join("|");

  const rows = data.clients.map((client) => {
    if (client.searchType === "B") {
      return `20|${client.sequence}|B|${client.searchValue}||||`;
    }
    return `20|${client.sequence}|E|${client.searchValue}|${client.name}|${client.dateOfBirth}|${client.gender}|`;
  });

  return [header, ...rows].join("\n");
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
  const fileName = `${data.institutionCode}_1_${data.fileDate}_${data.version}_${data.iraCode}_${data.documentSetName}.txt`;
  const content = createCkycContent(data);
  const [created] = await db
    .insert(ckycRequestsTable)
    .values({
      fileName,
      content,
      recordCount: data.clients.length,
      status: "generated",
    })
    .returning();

  res.status(201).json(
    GenerateCkycRequestResponse.parse({
      ...toRequestResponse(created),
      content,
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

  const [updated] = await db
    .update(ckycRequestsTable)
    .set({
      responseFileName: parsed.data.fileName,
      responseContent: parsed.data.content,
      status: "response_uploaded",
    })
    .where(eq(ckycRequestsTable.id, params.data.id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "CKYC request not found" });
    return;
  }

  res.json(
    UploadCkycResponseResponse.parse(toRequestResponse(updated, true)),
  );
});

export default router;