import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { appUsersTable, db, type AppUser, type AppRole } from "@workspace/db";

export class VerifiedEmailRequiredError extends Error {
  constructor() {
    super("A verified primary email is required.");
    this.name = "VerifiedEmailRequiredError";
  }
}

export async function getOrCreateAppUser(clerkUserId: string): Promise<AppUser> {
  const [existing] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId))
    .limit(1);
  if (existing) return existing;

  const clerkUser = await clerkClient.users.getUser(clerkUserId);
  const primaryEmail = clerkUser.primaryEmailAddress;
  if (
    !primaryEmail?.emailAddress ||
    primaryEmail.verification?.status !== "verified"
  ) {
    throw new VerifiedEmailRequiredError();
  }

  const email = primaryEmail.emailAddress.trim().toLowerCase();
  const initialAdminEmail = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase();
  const role: AppRole =
    initialAdminEmail && email === initialAdminEmail ? "admin" : "viewer";
  const fullName =
    [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ").trim() ||
    email;

  const [created] = await db
    .insert(appUsersTable)
    .values({
      clerkUserId,
      email,
      fullName,
      role,
      lastSeenAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  const [concurrentCreation] = await db
    .select()
    .from(appUsersTable)
    .where(eq(appUsersTable.clerkUserId, clerkUserId))
    .limit(1);
  if (!concurrentCreation) {
    throw new Error("Application user could not be provisioned.");
  }
  return concurrentCreation;
}

export function toAppUserResponse(user: AppUser) {
  return {
    userId: user.clerkUserId,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
  };
}