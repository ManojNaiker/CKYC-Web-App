import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ckycCreateDataImportsTable = pgTable(
  "ckyc_create_data_imports",
  {
    id: serial("id").primaryKey(),
    sourceFileName: text("source_file_name").notNull(),
    rowCount: integer("row_count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

export const ckycCreateDataTable = pgTable("ckyc_create_data", {
  id: serial("id").primaryKey(),
  importId: integer("import_id").notNull(),
  sourceFileName: text("source_file_name").notNull(),
  refId: text("ref_id").notNull(),
  clientId: text("client_id").notNull(),
  transactionDate: text("transaction_date"),
  uploadedCkycNumber: text("uploaded_ckyc_number"),
  referenceNumber: text("reference_number"),
  status: text("status").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertCkycCreateDataImportSchema = createInsertSchema(
  ckycCreateDataImportsTable,
).omit({
  id: true,
  createdAt: true,
});

export const insertCkycCreateDataSchema = createInsertSchema(
  ckycCreateDataTable,
).omit({
  id: true,
  createdAt: true,
});

export type InsertCkycCreateDataImport = z.infer<
  typeof insertCkycCreateDataImportSchema
>;
export type InsertCkycCreateData = z.infer<typeof insertCkycCreateDataSchema>;
export type CkycCreateDataImport =
  typeof ckycCreateDataImportsTable.$inferSelect;
export type CkycCreateData = typeof ckycCreateDataTable.$inferSelect;