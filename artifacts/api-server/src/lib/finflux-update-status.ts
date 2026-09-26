import { sql } from "drizzle-orm";
import {
  db,
  finfluxCkycAttemptsTable,
  finfluxCkycUpdatesTable,
} from "@workspace/db";
import type { FinfluxUpdateOutcome } from "./finflux-update-jobs";

const WRITE_BATCH_SIZE = 500;

export async function persistFinfluxUpdateOutcomes(
  outcomes: FinfluxUpdateOutcome[],
): Promise<void> {
  for (let start = 0; start < outcomes.length; start += WRITE_BATCH_SIZE) {
    const batch = outcomes.slice(start, start + WRITE_BATCH_SIZE);
    await db.transaction(async (tx) => {
      await tx
        .insert(finfluxCkycAttemptsTable)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            finfluxCkycAttemptsTable.clientId,
            finfluxCkycAttemptsTable.ckycNumber,
          ],
          set: {
            jobId: sql`excluded.job_id`,
            status: sql`excluded.status`,
            error: sql`excluded.error`,
            statusCode: sql`excluded.status_code`,
            resourceId: sql`excluded.resource_id`,
            attemptedAt: sql`now()`,
          },
        });

      const successfulUpdates = batch
        .filter((outcome) => outcome.status === "success")
        .map((outcome) => ({
          clientId: outcome.clientId,
          ckycNumber: outcome.ckycNumber,
          statusCode: outcome.statusCode ?? 200,
          resourceId: outcome.resourceId,
        }));

      if (successfulUpdates.length > 0) {
        await tx
          .insert(finfluxCkycUpdatesTable)
          .values(successfulUpdates)
          .onConflictDoUpdate({
            target: [
              finfluxCkycUpdatesTable.clientId,
              finfluxCkycUpdatesTable.ckycNumber,
            ],
            set: {
              statusCode: sql`excluded.status_code`,
              resourceId: sql`coalesce(excluded.resource_id, ${finfluxCkycUpdatesTable.resourceId})`,
              updatedAt: sql`now()`,
            },
          });
      }
    });
  }
}