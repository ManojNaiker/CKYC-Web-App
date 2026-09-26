import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/** Persisted opaque sessions. Token material is never stored, only its HMAC. */
export const authSessionsTable = pgTable(
  "auth_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    csrfHash: text("csrf_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("auth_sessions_user_id_idx").on(table.userId)],
);

export const insertAuthSessionSchema = createInsertSchema(authSessionsTable);
export type InsertAuthSession = z.infer<typeof insertAuthSessionSchema>;
export type AuthSession = typeof authSessionsTable.$inferSelect;