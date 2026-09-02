import { Router, type IRouter } from "express";
import { and, desc, ilike, or, sql } from "drizzle-orm";
import { db, clientsTable } from "@workspace/db";
import {
  ImportClientsBody,
  ImportClientsResponse,
  ListClientsQueryParams,
  ListClientsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
  };
}

router.get("/clients", async (req, res): Promise<void> => {
  const parsed = ListClientsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { search, page, pageSize } = parsed.data;
  const offset = (page - 1) * pageSize;
  const filter = search
    ? or(
        ilike(clientsTable.loanid, `%${search}%`),
        ilike(clientsTable.clientId, `%${search}%`),
        ilike(clientsTable.clientName, `%${search}%`),
        ilike(clientsTable.clientUid, `%${search}%`),
        ilike(clientsTable.clientVid, `%${search}%`),
        ilike(clientsTable.mobileNo, `%${search}%`),
      )
    : undefined;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(clientsTable)
      .where(filter ? and(filter) : undefined)
      .orderBy(desc(clientsTable.createdAt), desc(clientsTable.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(clientsTable)
      .where(filter ? and(filter) : undefined),
  ]);

  res.json(
    ListClientsResponse.parse({
      items: rows.map(toClientResponse),
      total: Number(countRows[0]?.count ?? 0),
      page,
      pageSize,
    }),
  );
});

router.post("/clients", async (req, res): Promise<void> => {
  const parsed = ImportClientsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const sourceFileName = parsed.data.fileName ?? null;
  const values = parsed.data.rows.map((row) => ({
    loanid: row.loanid,
    clientId: row.ClientID,
    disbursedOnDate: row.disbursedon_date,
    clientUid: row.Client_UID,
    clientVid: row.Client_VID,
    clientPan: row.Client_PAN,
    clientName: row.ClientName,
    mobileNo: row.mobile_no,
    alternateMobileNo: row.alternate_mobile_no,
    gender: row.Gender,
    dateOfBirth: row.date_of_birth,
    sourceFileName,
  }));

  for (let index = 0; index < values.length; index += 500) {
    await db.insert(clientsTable).values(values.slice(index, index + 500));
  }

  res.status(201).json(
    ImportClientsResponse.parse({
      imported: values.length,
      skipped: 0,
      fileName: sourceFileName,
    }),
  );
});

export default router;