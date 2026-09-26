import type { NextFunction, Request, Response } from "express";
import { auditTrailTable, db, type AppUser } from "@workspace/db";

function shouldAudit(req: Request): boolean {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) return true;
  if (req.method !== "GET") return false;

  return (
    req.path === "/clients/export" ||
    req.path.startsWith("/ckyc/") &&
      (req.path.includes("/export") || req.path.endsWith("/file"))
  );
}

export function auditApiActivity(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    process.env.NODE_ENV === "test" &&
    process.env.CKYC_TEST_AUTH_BYPASS === "1"
  ) {
    next();
    return;
  }

  if (!shouldAudit(req)) {
    next();
    return;
  }

  const actor = res.locals.appUser as AppUser | undefined;
  if (!actor) {
    next();
    return;
  }

  res.once("finish", () => {
    if (res.locals.auditRecorded === true) {
      return;
    }

    const metadata =
      req.path.startsWith("/admin/users/") && req.path.endsWith("/role")
        ? { assignedRole: req.body?.role ?? null }
        : req.path === "/admin/users" && req.method === "POST"
          ? {
              createdUsername:
                typeof req.body?.username === "string"
                  ? req.body.username.trim().toLowerCase()
                  : null,
              assignedRole: req.body?.role ?? null,
            }
        : {};
    const rawRequestId = (req as Request & { id?: string | number }).id;
    void db
      .insert(auditTrailTable)
      .values({
        actorUserId: actor.clerkUserId,
        actorRole: actor.role,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        requestId: rawRequestId == null ? null : String(rawRequestId),
        metadata,
      })
      .catch((error: unknown) => {
        req.log.error(
          { err: error, path: req.path, actorUserId: actor.clerkUserId },
          "Failed to persist audit activity",
        );
      });
  });

  next();
}