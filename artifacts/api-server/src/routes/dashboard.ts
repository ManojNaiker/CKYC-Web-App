import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import { db, clientsTable, ckycRequestsTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [clientCount, requestCount, responseCount, lastClient, lastRequest] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(clientsTable),
      db.select({ count: sql<number>`count(*)` }).from(ckycRequestsTable),
      db
        .select({ count: sql<number>`count(*)` })
        .from(ckycRequestsTable)
        .where(eq(ckycRequestsTable.status, "response_uploaded")),
      db
        .select({
          fileName: clientsTable.sourceFileName,
          createdAt: clientsTable.createdAt,
        })
        .from(clientsTable)
        .orderBy(desc(clientsTable.createdAt))
        .limit(1),
      db
        .select({ createdAt: ckycRequestsTable.createdAt })
        .from(ckycRequestsTable)
        .orderBy(desc(ckycRequestsTable.createdAt))
        .limit(1),
    ]);

  const activityDates = [
    lastClient[0]?.createdAt,
    lastRequest[0]?.createdAt,
  ].filter((value): value is Date => value instanceof Date);

  const lastActivityAt = activityDates.length
    ? new Date(Math.max(...activityDates.map((value) => value.getTime()))).toISOString()
    : null;

  res.json(
    GetDashboardSummaryResponse.parse({
      totalClients: Number(clientCount[0]?.count ?? 0),
      generatedRequests: Number(requestCount[0]?.count ?? 0),
      responsesUploaded: Number(responseCount[0]?.count ?? 0),
      lastImportFile: lastClient[0]?.fileName ?? null,
      lastActivityAt,
    }),
  );
});

export default router;