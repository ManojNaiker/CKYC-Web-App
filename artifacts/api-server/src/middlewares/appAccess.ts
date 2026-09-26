import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { appUsersTable, db, type AppUser } from "@workspace/db";
import { getOrCreateAppUser, VerifiedEmailRequiredError } from "../lib/app-users";
import { canAccessApiPath } from "../lib/role-permissions";

const testAppUser: AppUser = {
  clerkUserId: "ckyc-workflow-test",
  email: "workflow-test@invalid.local",
  fullName: "CKYC Workflow Test",
  role: "manager",
  lastSeenAt: new Date(0),
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

export async function resolveAppUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (
    process.env.NODE_ENV === "test" &&
    process.env.CKYC_TEST_AUTH_BYPASS === "1"
  ) {
    res.locals.appUser = testAppUser;
    next();
    return;
  }

  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: "Sign in to access this workspace." });
    return;
  }

  try {
    let user = await getOrCreateAppUser(userId);
    if (!user.lastSeenAt || Date.now() - user.lastSeenAt.getTime() > 300_000) {
      const now = new Date();
      const [updated] = await db
        .update(appUsersTable)
        .set({ lastSeenAt: now })
        .where(eq(appUsersTable.clerkUserId, userId))
        .returning();
      if (updated) user = updated;
    }
    res.locals.appUser = user;
    next();
  } catch (error) {
    if (error instanceof VerifiedEmailRequiredError) {
      res.status(403).json({ error: "Verify your primary email to continue." });
      return;
    }
    req.log.error({ err: error }, "Could not resolve signed-in app user");
    res.status(503).json({ error: "Account access is temporarily unavailable." });
  }
}

export function authorizeAppUser(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = res.locals.appUser as AppUser | undefined;
  if (!user || !canAccessApiPath(user.role, req.path, req.method)) {
    res.status(403).json({ error: "Your account does not have access to this page." });
    return;
  }
  next();
}