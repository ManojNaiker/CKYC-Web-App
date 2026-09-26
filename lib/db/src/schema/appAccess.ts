import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type AppRole = "admin" | "manager" | "viewer";

export const appUsersTable = pgTable(
  "app_users",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    email: text("email").notNull(),
    fullName: text("full_name").notNull(),
    username: text("username"),
    passwordHash: text("password_hash"),
    role: text("role").$type<AppRole>().notNull().default("viewer"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("app_users_username_unique").on(table.username),
    check(
      "app_users_role_check",
      sql`${table.role} IN ('admin', 'manager', 'viewer')`,
    ),
  ],
);

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;

export const auditTrailTable = pgTable(
  "audit_trail",
  {
    id: serial("id").primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    actorRole: text("actor_role").$type<AppRole>().notNull(),
    method: text("method").notNull(),
    path: text("path").notNull(),
    statusCode: integer("status_code").notNull(),
    requestId: text("request_id"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("audit_trail_created_at_idx").on(table.createdAt),
    index("audit_trail_actor_user_id_idx").on(table.actorUserId),
    check(
      "audit_trail_actor_role_check",
      sql`${table.actorRole} IN ('admin', 'manager', 'viewer')`,
    ),
  ],
);

export const insertAuditTrailSchema = createInsertSchema(auditTrailTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditTrail = z.infer<typeof insertAuditTrailSchema>;
export type AuditTrailEvent = typeof auditTrailTable.$inferSelect;