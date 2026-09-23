import type { NextFunction, Request, RequestHandler, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  appRoles,
  appUsersTable,
  auditLogsTable,
  db,
  type AppRole,
  type AppUser,
} from "@workspace/db";
import { logger } from "../lib/logger";

export type AppPermission =
  | "users:read"
  | "users:write"
  | "audit:read"
  | "workspace:read"
  | "workspace:write";

const rolePermissions: Record<AppRole, readonly AppPermission[]> = {
  admin: [
    "users:read",
    "users:write",
    "audit:read",
    "workspace:read",
    "workspace:write",
  ],
  manager: ["audit:read", "workspace:read", "workspace:write"],
  viewer: ["workspace:read"],
};

type TestAppUser = AppUser;

function createTestUser(): TestAppUser {
  return {
    id: 0,
    clerkUserId: "test-user",
    email: "test@example.com",
    displayName: "Test user",
    role: "admin",
    status: "active",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastSeenAt: new Date(0),
  };
}

async function provisionCurrentUser(clerkUserId: string): Promise<AppUser> {
  const existing = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (existing[0]) {
    if (
      existing[0].status === "active" &&
      Date.now() - existing[0].lastSeenAt.getTime() > 5 * 60 * 1000
    ) {
      await db
        .update(appUsersTable)
        .set({ lastSeenAt: new Date(), updatedAt: new Date() })
        .where(eq(appUsersTable.id, existing[0].id));
      return { ...existing[0], lastSeenAt: new Date(), updatedAt: new Date() };
    }
    return existing[0];
  }

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const email =
    clerkUser.emailAddresses.find(
      (address) => address.id === clerkUser.primaryEmailAddressId,
    )?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    `${clerkUserId}@clerk.local`;
  const displayName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
    email;
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(appUsersTable);
  const role: AppRole = Number(count) === 0 ? "admin" : "viewer";

  await db
    .insert(appUsersTable)
    .values({
      clerkUserId,
      email,
      displayName,
      role,
      status: "active",
    })
    .onConflictDoNothing({ target: appUsersTable.clerkUserId });

  const created = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId))
    .limit(1);

  if (!created[0]) {
    throw new Error("Could not provision the signed-in user.");
  }

  return created[0];
}

export async function requireCurrentUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (process.env.NODE_ENV === "test") {
    res.locals.appUser = createTestUser();
    next();
    return;
  }

  try {
    const { userId } = getAuth(req);
    if (!userId) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const appUser = await provisionCurrentUser(userId);
    if (appUser.status !== "active") {
      res.status(403).json({ error: "This user account is disabled." });
      return;
    }

    res.locals.appUser = appUser;
    next();
  } catch (error) {
    logger.error({ err: error }, "Could not resolve the current application user");
    res.status(500).json({ error: "Could not resolve the current user." });
  }
}

export function requirePermission(permission: AppPermission): RequestHandler {
  return (req, res, next) => {
    const appUser = res.locals.appUser;
    if (!appUser) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    const currentUser = getCurrentUser(res);
    if (!rolePermissions[currentUser.role].includes(permission)) {
      res.status(403).json({
        error: `The ${currentUser.role} role does not have ${permission} permission.`,
      });
      return;
    }

    next();
  };
}

export function requireWorkspacePermission(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const permission: AppPermission =
    ["GET", "HEAD", "OPTIONS"].includes(req.method)
      ? "workspace:read"
      : "workspace:write";
  requirePermission(permission)(req, res, next);
}

export function hasPermission(
  role: AppRole,
  permission: AppPermission,
): boolean {
  return rolePermissions[role].includes(permission);
}

export function getCurrentUser(res: Response): AppUser {
  if (!res.locals.appUser) {
    throw new Error("Current application user is not available.");
  }
  return res.locals.appUser;
}

export async function writeAuditLog(input: {
  actor: AppUser;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if (input.actor.id === 0) return;

  await db.insert(auditLogsTable).values({
    actorUserId: input.actor.id,
    actorClerkUserId: input.actor.clerkUserId,
    actorName: input.actor.displayName,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    metadata: input.metadata ?? {},
  });
}

function entityDetails(path: string): {
  entityType: string;
  entityId: string | null;
} {
  const segments = path.split("/").filter(Boolean);
  return {
    entityType: segments[0] ?? "workspace",
    entityId: segments.find((segment) => /^\d+$/.test(segment)) ?? null,
  };
}

export function auditMutationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (process.env.NODE_ENV === "test" || ["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }

  res.on("finish", () => {
    const actor = res.locals.appUser;
    if (!actor) return;

    const path = req.originalUrl.split("?")[0];
    const details = entityDetails(path);
    void writeAuditLog({
      actor,
      action: `${req.method.toLowerCase()}_${details.entityType}`,
      entityType: details.entityType,
      entityId: details.entityId,
      summary: `${req.method} ${path}`,
      metadata: {
        statusCode: res.statusCode,
        outcome: res.statusCode < 400 ? "success" : "failure",
        ...(req.body &&
        typeof req.body === "object" &&
        (req.body.role !== undefined || req.body.status !== undefined)
          ? {
              changedFields: {
                ...(req.body.role !== undefined ? { role: req.body.role } : {}),
                ...(req.body.status !== undefined
                  ? { status: req.body.status }
                  : {}),
              },
            }
          : {}),
      },
    }).catch((error) => {
      logger.error({ err: error, path }, "Could not write audit log");
    });
  });

  next();
}

export const appRoleValues = appRoles;