import { Router, type IRouter } from "express";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db, clientsTable, ckycRequestsTable } from "@workspace/db";
import { GetDashboardSummaryResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [
    clientCount,
    requestCount,
    responseCount,
    finalCkycCount,
    requestIdCount,
    pendingCount,
    pendingErrorRows,
    lastClient,
    lastRequest,
  ] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(clientsTable),
      db.select({ count: sql<number>`count(*)` }).from(ckycRequestsTable),
      db
        .select({ count: sql<number>`count(*)` })
        .from(ckycRequestsTable)
        .where(eq(ckycRequestsTable.status, "response_uploaded")),
      db
        .select({ count: sql<number>`count(*)` })
        .from(clientsTable)
        .where(isNotNull(clientsTable.ckycNumber)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(clientsTable)
        .where(
          and(
            isNotNull(clientsTable.ckycResponseId),
            isNull(clientsTable.ckycNumber),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)` })
        .from(clientsTable)
        .where(isNull(clientsTable.ckycResponseId)),
      db
        .select({
          name: clientsTable.ckycResponseError,
          count: sql<number>`count(*)`,
        })
        .from(clientsTable)
        .where(
          and(
            isNull(clientsTable.ckycResponseId),
            eq(clientsTable.ckycResponseStatus, "error"),
          ),
        )
        .groupBy(clientsTable.ckycResponseError)
        .orderBy(desc(sql`count(*)`)),
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
      finalCkycUpdated: Number(finalCkycCount[0]?.count ?? 0),
      requestIdUpdated: Number(requestIdCount[0]?.count ?? 0),
      recordsPending: Number(pendingCount[0]?.count ?? 0),
      pendingErrors: pendingErrorRows.map((row) => ({
        name: row.name?.trim() || "Unknown error",
        count: Number(row.count ?? 0),
      })),
      lastImportFile: lastClient[0]?.fileName ?? null,
      lastActivityAt,
    }),
  );
});

export default router;