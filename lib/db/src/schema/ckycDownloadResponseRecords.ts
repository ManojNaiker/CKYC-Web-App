import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ckycDownloadResponseRecordsTable = pgTable(
  "ckyc_download_response_records",
  {
    id: serial("id").primaryKey(),
    requestNumber: integer("request_number"),
    sourceFileName: text("source_file_name").notNull(),
    content: text("content").notNull(),
    recordCount: integer("record_count").notNull(),
    matchedRequestId: integer("matched_request_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
  },
);

export const insertCkycDownloadResponseRecordSchema = createInsertSchema(
  ckycDownloadResponseRecordsTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertCkycDownloadResponseRecord = z.infer<
  typeof insertCkycDownloadResponseRecordSchema
>;
export type CkycDownloadResponseRecord =
  typeof ckycDownloadResponseRecordsTable.$inferSelect;