import { sql } from "drizzle-orm";
import { db, finfluxCkycUpdatesTable } from "@workspace/db";
import type { FinfluxSuccessfulUpdate } from "./finflux-update-jobs";

const WRITE_BATCH_SIZE = 500;

export async function persistFinfluxSuccessfulUpdates(
  updates: FinfluxSuccessfulUpdate[],
): Promise<void> {
  for (let start = 0; start < updates.length; start += WRITE_BATCH_SIZE) {
    const batch = updates.slice(start, start + WRITE_BATCH_SIZE);
    await db
      .insert(finfluxCkycUpdatesTable)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          finfluxCkycUpdatesTable.clientId,
          finfluxCkycUpdatesTable.ckycNumber,
        ],
        set: {
          statusCode: sql`excluded.status_code`,
          updatedAt: sql`now()`,
        },
      });
  }
}