import { integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ckycDownloadRequestsTable = pgTable(
  "ckyc_download_requests",
  {
    id: serial("id").primaryKey(),
    requestNumber: integer("request_number").notNull(),
    fileName: text("file_name").notNull(),
    content: text("content").notNull(),
    recordCount: integer("record_count").notNull(),
    sourceFileName: text("source_file_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("ckyc_download_requests_request_number_unique").on(table.requestNumber),
    unique("ckyc_download_requests_file_name_unique").on(table.fileName),
  ],
);

export const insertCkycDownloadRequestSchema = createInsertSchema(
  ckycDownloadRequestsTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertCkycDownloadRequest = z.infer<
  typeof insertCkycDownloadRequestSchema
>;
export type CkycDownloadRequest =
  typeof ckycDownloadRequestsTable.$inferSelect;