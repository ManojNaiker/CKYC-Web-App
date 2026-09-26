import { Router, type IRouter } from "express";
import { randomUUID } from "node:crypto";
import { count, desc, eq, sql } from "drizzle-orm";
import type {
  AdminUsersResponse,
  AuditTrailsResponse,
  CurrentAppUserResponse,
} from "@workspace/api-zod";
import { CreateAdminUserBody, UpdateAdminUserBody } from "@workspace/api-zod";
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

router.patch("/admin/users/:userId", async (req, res): Promise<void> => {
  const rawUserId = req.params.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  const parsed = UpdateAdminUserBody.safeParse(req.body);
  if (!userId || !parsed.success) {
    res.status(400).json({ error: "Enter valid user details." });
    return;
  }

  const fullName = parsed.data.fullName.trim();
  const email = parsed.data.email.trim().toLowerCase();
  const username = parsed.data.username?.trim().toLowerCase() || null;
  if (!fullName || !email) {
    res.status(400).json({ error: "Name and contact email are required." });
    return;
  }

  const [initialTarget] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, userId))
    .limit(1);
  if (!initialTarget) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const isBootstrapAdmin = userId === LOCAL_ADMIN_USER_ID;
  if (
    isBootstrapAdmin &&
    (username !== "admin" ||
      parsed.data.password !== undefined ||
      parsed.data.role !== "admin")
  ) {
    res.status(409).json({
      error: "The bootstrap Admin username is fixed and its password is managed through Replit Secrets.",
    });
    return;
  }
  if (!isBootstrapAdmin && username === "admin") {
    res.status(409).json({ error: "The Admin username is reserved." });
    return;
  }
  if (!isBootstrapAdmin && initialTarget.username && !username) {
    res.status(409).json({
      error: "Choose a replacement username instead of removing this login.",
    });
    return;
  }
  if (!username && parsed.data.password !== undefined) {
    res.status(400).json({ error: "Set a username before setting a password." });
    return;
  }
  if (
    !isBootstrapAdmin &&
    username &&
    !initialTarget.passwordHash &&
    parsed.data.password === undefined
  ) {
    res.status(400).json({
      error: "Enter an initial password to enable this user's login.",
    });
    return;
  }

  if (username && username !== initialTarget.username) {
    const [existing] = await db
      .select({ userId: appUsersTable.clerkUserId })
      .from(appUsersTable)
      .where(eq(appUsersTable.username, username))
      .limit(1);
    if (existing && existing.userId !== userId) {
      res.status(409).json({ error: "That username is already in use." });
      return;
    }
  }

  try {
    const suppliedPasswordHash =
      parsed.data.password === undefined
        ? undefined
        : await hashLocalPassword(parsed.data.password);

    type UpdateResult =
      | { kind: "updated"; user: AppUser }
      | { kind: "not-found" }
      | { kind: "last-admin" }
      | { kind: "rejected"; status: 400 | 409; message: string };

    const result: UpdateResult = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(10430205)`);
      const [target] = await tx
        .select()
        .from(appUsersTable)
        .where(eq(appUsersTable.clerkUserId, userId))
        .limit(1);
      if (!target) return { kind: "not-found" };

      if (
        userId === LOCAL_ADMIN_USER_ID &&
        (username !== "admin" ||
          parsed.data.password !== undefined ||
          parsed.data.role !== "admin")
      ) {
        return {
          kind: "rejected",
          status: 409,
          message: "The bootstrap Admin username is fixed and its password is managed through Replit Secrets.",
        };
      }
      if (
        userId !== LOCAL_ADMIN_USER_ID &&
        (username === "admin" || (target.username && !username))
      ) {
        return {
          kind: "rejected",
          status: 409,
          message:
            username === "admin"
              ? "The Admin username is reserved."
              : "Choose a replacement username instead of removing this login.",
        };
      }
      if (!username && parsed.data.password !== undefined) {
        return {
          kind: "rejected",
          status: 400,
          message: "Set a username before setting a password.",
        };
      }
      if (
        userId !== LOCAL_ADMIN_USER_ID &&
        username &&
        !target.passwordHash &&
        parsed.data.password === undefined
      ) {
        return {
          kind: "rejected",
          status: 400,
          message: "Enter an initial password to enable this user's login.",
        };
      }

      if (username && username !== target.username) {
        const [existing] = await tx
          .select({ userId: appUsersTable.clerkUserId })
          .from(appUsersTable)
          .where(eq(appUsersTable.username, username))
          .limit(1);
        if (existing && existing.userId !== userId) {
          return {
            kind: "rejected",
            status: 409,
            message: "That username is already in use.",
          };
        }
      }

      if (target.role === "admin" && parsed.data.role !== "admin") {
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
        .set({
          email,
          fullName,
          username,
          passwordHash: suppliedPasswordHash ?? target.passwordHash,
          role: parsed.data.role,
        })
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
    if (result.kind === "rejected") {
      res.status(result.status).json({ error: result.message });
      return;
    }
    const response: CurrentAppUserResponse = {
      user: toAppUserResponse(result.user),
    };
    res.json(response);
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
    req.log.error({ err: error }, "Could not update local user account");
    res.status(503).json({ error: "User account update is temporarily unavailable." });
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