import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const finfluxCkycUpdatesTable = pgTable(
  "finflux_ckyc_updates",
  {
    id: serial("id").primaryKey(),
    clientId: text("client_id").notNull(),
    ckycNumber: text("ckyc_number").notNull(),
    statusCode: integer("status_code").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("finflux_ckyc_updates_identifier_unique").on(
      table.clientId,
      table.ckycNumber,
    ),
  ],
);