import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { count, desc, eq, sql } from "drizzle-orm";
import type {
  AdminUsersResponse,
  AuditTrailsResponse,
  CurrentAppUserResponse,
} from "@workspace/api-zod";
import { CreateAdminUserBody } from "@workspace/api-zod";
import {
  appUsersTable,
  auditTrailTable,
  db,
  type AppRole,
  type AppUser,
} from "@workspace/db";
import { toAppUserResponse } from "../lib/app-users";
import { LOCAL_ADMIN_USER_ID } from "../lib/local-auth";
import { hashLocalPassword } from "../lib/password-hash";

const router: IRouter = Router();
const roleValues = new Set<AppRole>(["admin", "manager", "viewer"]);

function parseIntegerQuery(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  if (value === undefined) return fallback;
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== "string" && typeof first !== "number") return null;
  const parsed = Number(first);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    return null;
  }
  return parsed;
}

router.get("/admin/users", async (_req, res): Promise<void> => {
  const users = await db
    .select()
    .from(appUsersTable)
    .orderBy(appUsersTable.role, appUsersTable.email);
  const response: AdminUsersResponse = {
    users: users.map(toAppUserResponse),
  };
  res.json(response);
});

router.post("/admin/users", async (req, res): Promise<void> => {
  const parsed = CreateAdminUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter valid user details." });
    return;
  }

  const fullName = parsed.data.fullName.trim();
  const username = parsed.data.username.trim().toLowerCase();
  const email = parsed.data.email?.trim().toLowerCase() || `${username}@local.invalid`;
  if (!fullName || username === "admin") {
    res.status(username === "admin" ? 409 : 400).json({
      error:
        username === "admin"
          ? "The Admin username is reserved."
          : "Enter a user's name.",
    });
    return;
  }

  const [existing] = await db
    .select({ userId: appUsersTable.clerkUserId })
    .from(appUsersTable)
    .where(eq(appUsersTable.username, username))
    .limit(1);
  if (existing) {
    res.status(409).json({ error: "That username is already in use." });
    return;
  }

  try {
    const passwordHash = await hashLocalPassword(parsed.data.password);
    const [user] = await db
      .insert(appUsersTable)
      .values({
        clerkUserId: `local-user-${randomUUID()}`,
        email,
        fullName,
        username,
        passwordHash,
        role: parsed.data.role,
      })
      .returning();
    if (!user) {
      res.status(500).json({ error: "The user account could not be created." });
      return;
    }
    const response: CurrentAppUserResponse = {
      user: toAppUserResponse(user),
    };
    res.status(201).json(response);
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "23505"
    ) {
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
    req.log.error({ err: error }, "Could not create local user account");
    res.status(503).json({ error: "User account creation is temporarily unavailable." });
  }
});

router.patch("/admin/users/:userId/role", async (req, res): Promise<void> => {
  const rawUserId = req.params.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  const requestedRole = (req.body as { role?: unknown } | undefined)?.role;
  if (
    !userId ||
    typeof requestedRole !== "string" ||
    !roleValues.has(requestedRole as AppRole)
  ) {
    res.status(400).json({ error: "Choose a valid user role." });
    return;
  }
  const nextRole = requestedRole as AppRole;
  if (userId === LOCAL_ADMIN_USER_ID && nextRole !== "admin") {
    res.status(409).json({ error: "The local Admin account must remain an administrator." });
    return;
  }

  type UpdateResult =
    | { kind: "updated"; user: AppUser }
    | { kind: "not-found" }
    | { kind: "last-admin" };

  const result: UpdateResult = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(10430205)`);
    const [target] = await tx
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.clerkUserId, userId))
      .limit(1);
    if (!target) return { kind: "not-found" };

    if (target.role === "admin" && nextRole !== "admin") {
      const [adminCount] = await tx
        .select({ value: count() })
        .from(appUsersTable)
        .where(eq(appUsersTable.role, "admin"));
      if (Number(adminCount?.value ?? 0) <= 1) {
        return { kind: "last-admin" };
      }
    }

    const [updated] = await tx
      .update(appUsersTable)
      .set({ role: nextRole })
      .where(eq(appUsersTable.clerkUserId, userId))
      .returning();
    return updated
      ? { kind: "updated", user: updated }
      : { kind: "not-found" };
  });

  if (result.kind === "last-admin") {
    res.status(409).json({ error: "At least one administrator must remain." });
    return;
  }
  if (result.kind === "not-found") {
    res.status(404).json({ error: "User not found." });
    return;
  }
  const response: CurrentAppUserResponse = {
    user: toAppUserResponse(result.user),
  };
  res.json(response);
});

router.get("/admin/audit-trails", async (req, res): Promise<void> => {
  const limit = parseIntegerQuery(req.query.limit, 100, 1, 200);
  const offset = parseIntegerQuery(req.query.offset, 0, 0);
  if (limit === null || offset === null) {
    res.status(400).json({ error: "Invalid audit history range." });
    return;
  }

  const [rows, totalRows] = await Promise.all([
    db
      .select({
        event: auditTrailTable,
        actorEmail: appUsersTable.email,
      })
      .from(auditTrailTable)
      .leftJoin(
        appUsersTable,
        eq(appUsersTable.clerkUserId, auditTrailTable.actorUserId),
      )
      .orderBy(desc(auditTrailTable.createdAt), desc(auditTrailTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(auditTrailTable),
  ]);

  const response: AuditTrailsResponse = {
    events: rows.map(({ event, actorEmail }) => ({
        id: event.id,
        actorUserId: event.actorUserId,
        actorEmail: actorEmail ?? null,
        actorRole: event.actorRole,
        method: event.method,
        path: event.path,
        statusCode: event.statusCode,
        requestId: event.requestId,
        metadata: event.metadata,
        createdAt: event.createdAt,
      })),
      total: Number(totalRows[0]?.total ?? 0),
      limit,
      offset,
  };
  res.json(response);
});

export default router;