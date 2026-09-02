import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ckycRequestsTable = pgTable("ckyc_requests", {
  id: serial("id").primaryKey(),
  fileName: text("file_name").notNull(),
  content: text("content").notNull(),
  recordCount: integer("record_count").notNull(),
  status: text("status").notNull().default("generated"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  responseFileName: text("response_file_name"),
  responseContent: text("response_content"),
  clientMapping: text("client_mapping"),
});

export const insertCkycRequestSchema = createInsertSchema(
  ckycRequestsTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertCkycRequest = z.infer<typeof insertCkycRequestSchema>;
export type CkycRequest = typeof ckycRequestsTable.$inferSelect;