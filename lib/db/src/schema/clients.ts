import {
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const clientsTable = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    loanid: text("loanid").notNull(),
    clientId: text("client_id").notNull(),
    disbursedOnDate: text("disbursed_on_date").notNull(),
    clientUid: text("client_uid").notNull(),
    clientVid: text("client_vid").notNull(),
    clientPan: text("client_pan").notNull(),
    clientName: text("client_name").notNull(),
    mobileNo: text("mobile_no").notNull(),
    alternateMobileNo: text("alternate_mobile_no").notNull(),
    gender: text("gender").notNull(),
    dateOfBirth: text("date_of_birth").notNull(),
    sourceFileName: text("source_file_name"),
    importIdentity: text("import_identity"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("clients_import_identity_unique").on(table.importIdentity),
  ],
);

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;