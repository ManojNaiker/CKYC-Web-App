import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const appRoles = ["admin", "manager", "viewer"] as const;
export const appUserStatuses = ["active", "disabled"] as const;

export type AppRole = (typeof appRoles)[number];
export type AppUserStatus = (typeof appUserStatuses)[number];

export const appUsersTable = pgTable(
  "app_users",
  {
    id: serial("id").primaryKey(),
    clerkUserId: text("clerk_user_id").notNull(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    role: text("role").$type<AppRole>().notNull().default("viewer"),
    status: text("status")
      .$type<AppUserStatus>()
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    clerkUserIdUnique: unique("app_users_clerk_user_id_unique").on(
      table.clerkUserId,
    ),
  }),
);

export const insertAppUserSchema = createInsertSchema(appUsersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSeenAt: true,
});

export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsersTable.$inferSelect;