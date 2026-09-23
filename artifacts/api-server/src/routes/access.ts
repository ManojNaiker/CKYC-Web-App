import { Router, type IRouter } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import {
  appRoles,
  appUserStatuses,
  appUsersTable,
  auditLogsTable,
  db,
} from "@workspace/db";
import {
  getCurrentUser,
  hasPermission,
  requirePermission,
} from "../middleware/auth";

const router: IRouter = Router();

function parseUserUpdate(body: unknown): {
  role?: (typeof appRoles)[number];
  status?: (typeof appUserStatuses)[number];
} | null {
  if (!body || typeof body !== "object") return null;
  const input = body as Record<string, unknown>;
  const role = input.role;
  const status = input.status;
  if (
    (role !== undefined && !appRoles.includes(role as (typeof appRoles)[number])) ||
    (status !== undefined &&
      !appUserStatuses.includes(status as (typeof appUserStatuses)[number]))
  ) {
    return null;
  }
  if (role === undefined && status === undefined) return null;
  return {
    ...(role !== undefined
      ? { role: role as (typeof appRoles)[number] }
      : {}),
    ...(status !== undefined
      ? { status: status as (typeof appUserStatuses)[number] }
      : {}),
  };
}

function serializeUser(user: typeof appUsersTable.$inferSelect) {
  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    lastSeenAt: user.lastSeenAt.toISOString(),
  };
}

router.get("/me", (req, res) => {
  const currentUser = getCurrentUser(res);
  res.json({
    ...serializeUser(currentUser),
    permissions: [
      "users:read",
      "users:write",
      "audit:read",
      "workspace:read",
      "workspace:write",
    ].filter((permission) =>
      hasPermission(currentUser.role, permission as Parameters<typeof hasPermission>[1]),
    ),
  });
});

router.get(
  "/users",
  requirePermission("users:read"),
  async (_req, res): Promise<void> => {
    const users = await db
      .select()
      .from(appUsersTable)
      .orderBy(asc(appUsersTable.displayName), asc(appUsersTable.id));
    res.json({ items: users.map(serializeUser), total: users.length });
  },
);

router.patch(
  "/users/:id",
  requirePermission("users:write"),
  async (req, res): Promise<void> => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId < 1) {
      res.status(400).json({ error: "User id must be a positive integer." });
      return;
    }

    const parsed = parseUserUpdate(req.body);
    if (!parsed) {
      res.status(400).json({ error: "Provide a role or status to update." });
      return;
    }

    const currentUser = getCurrentUser(res);
    const targetRows = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.id, userId))
      .limit(1);
    const target = targetRows[0];
    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }

    if (
      target.id === currentUser.id &&
      parsed.status === "disabled"
    ) {
      res.status(400).json({ error: "You cannot disable your own account." });
      return;
    }

    const nextRole = parsed.role ?? target.role;
    const nextStatus = parsed.status ?? target.status;
    if (
      target.role === "admin" &&
      (nextRole !== "admin" || nextStatus !== "active")
    ) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(appUsersTable)
        .where(
          and(
            eq(appUsersTable.role, "admin"),
            eq(appUsersTable.status, "active"),
          ),
        );
      if (Number(count) <= 1) {
        res.status(400).json({
          error: "Keep at least one active Admin in the workspace.",
        });
        return;
      }
    }

    const updatedRows = await db
      .update(appUsersTable)
      .set({
        ...(parsed.role ? { role: parsed.role } : {}),
        ...(parsed.status ? { status: parsed.status } : {}),
        updatedAt: new Date(),
      })
      .where(eq(appUsersTable.id, userId))
      .returning();

    res.json(serializeUser(updatedRows[0]));
  },
);

router.get(
  "/audit-logs",
  requirePermission("audit:read"),
  async (req, res): Promise<void> => {
    const rawLimit = Number(req.query.limit ?? 50);
    const rawOffset = Number(req.query.offset ?? 0);
    const limit = Number.isInteger(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 100)
      : 50;
    const offset = Number.isInteger(rawOffset)
      ? Math.max(rawOffset, 0)
      : 0;

    const [items, totalRows] = await Promise.all([
      db
        .select()
        .from(auditLogsTable)
        .orderBy(desc(auditLogsTable.createdAt), desc(auditLogsTable.id))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)` }).from(auditLogsTable),
    ]);

    res.json({
      items: items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      total: Number(totalRows[0]?.count ?? 0),
      limit,
      offset,
    });
  },
);

export default router;