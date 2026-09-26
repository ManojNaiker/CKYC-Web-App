import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Request, Response } from "express";
import { appUsersTable, authSessionsTable, db, type AppUser } from "@workspace/db";
import { verifyLocalPassword } from "./password-hash";

export const SESSION_COOKIE = "ckyc_session";
export const CSRF_COOKIE = "ckyc_csrf";
export const LOCAL_ADMIN_USER_ID = "local-admin";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function secret(): string | undefined {
  const value = process.env.SESSION_SECRET;
  return value && value.length >= 32 ? value : undefined;
}
function digest(value: string): string {
  return createHmac("sha256", secret() ?? "invalid-session-secret").update(value).digest("hex");
}
function token(): string {
  return randomBytes(32).toString("base64url");
}
function equal(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function equalCredential(a: string, b: string): boolean {
  const key = secret();
  if (!key) return false;
  const left = createHmac("sha256", key).update(a).digest();
  const right = createHmac("sha256", key).update(b).digest();
  return timingSafeEqual(left, right);
}
function cookie(req: Request, name: string): string | undefined {
  const match = (req.headers.cookie ?? "").match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}
function cookieOptions(httpOnly: boolean) {
  return { httpOnly, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };
}
export function csrfFromRequest(req: Request): string | undefined {
  return cookie(req, CSRF_COOKIE);
}
export function isRateLimited(req: Request): boolean {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    attempts.set(key, { count: 0, resetAt: now + WINDOW_MS });
    return false;
  }
  return current.count >= MAX_ATTEMPTS;
}
function recordFailure(req: Request): void {
  const key = req.ip || "unknown";
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
  else current.count += 1;
  if (attempts.size > 10000) attempts.delete(attempts.keys().next().value as string);
}
function clearFailures(req: Request): void {
  attempts.delete(req.ip || "unknown");
}

export async function authenticateLocal(username: unknown, password: unknown, req: Request): Promise<AppUser | null> {
  const suppliedUser =
    typeof username === "string" && username.length <= 64 ? username.trim() : "";
  const suppliedPassword =
    typeof password === "string" && password.length <= 1024 ? password : "";
  const normalizedUsername = suppliedUser.toLowerCase();
  if (isRateLimited(req) || !normalizedUsername || !suppliedPassword) {
    recordFailure(req);
    return null;
  }

  let user: AppUser | undefined;
  if (equal(normalizedUsername, "admin")) {
    const configured = process.env.CKYC_ADMIN_PASSWORD;
    if (!configured || !secret() || !equalCredential(suppliedPassword, configured)) {
      await verifyLocalPassword(suppliedPassword, null);
      recordFailure(req);
      return null;
    }
    [user] = await db
      .insert(appUsersTable)
      .values({
        clerkUserId: LOCAL_ADMIN_USER_ID,
        email: "admin@local.invalid",
        fullName: "Admin",
        username: "admin",
        passwordHash: null,
        role: "admin",
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appUsersTable.clerkUserId,
        set: {
          email: "admin@local.invalid",
          fullName: "Admin",
          username: "admin",
          passwordHash: null,
          role: "admin",
          lastSeenAt: new Date(),
        },
      })
      .returning();
  } else {
    const [candidate] = await db
      .select()
      .from(appUsersTable)
      .where(eq(appUsersTable.username, normalizedUsername))
      .limit(1);
    const passwordMatches = await verifyLocalPassword(
      suppliedPassword,
      candidate?.passwordHash,
    );
    if (!candidate || !candidate.passwordHash || !passwordMatches) {
      recordFailure(req);
      return null;
    }
    const [updated] = await db
      .update(appUsersTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(appUsersTable.clerkUserId, candidate.clerkUserId))
      .returning();
    user = updated ?? candidate;
  }

  if (!user) {
    recordFailure(req);
    return null;
  }
  clearFailures(req);
  return user;
}

export async function createSession(user: AppUser, res: Response): Promise<void> {
  if (!secret()) throw new Error("SESSION_SECRET is unavailable");
  const rawSession = token();
  const rawCsrf = token();
  await db.insert(authSessionsTable).values({
    tokenHash: digest(rawSession),
    csrfHash: digest(rawCsrf),
    userId: user.clerkUserId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
  });
  res.cookie(SESSION_COOKIE, rawSession, { ...cookieOptions(true), maxAge: SESSION_TTL_MS });
  res.cookie(CSRF_COOKIE, rawCsrf, { ...cookieOptions(false), maxAge: SESSION_TTL_MS });
}
export async function revokeSession(req: Request, res: Response): Promise<void> {
  const raw = cookie(req, SESSION_COOKIE);
  if (raw) await db.update(authSessionsTable).set({ revokedAt: new Date() }).where(eq(authSessionsTable.tokenHash, digest(raw)));
  res.clearCookie(SESSION_COOKIE, cookieOptions(true));
  res.clearCookie(CSRF_COOKIE, cookieOptions(false));
}
export async function resolveSession(req: Request): Promise<AppUser | undefined> {
  const raw = cookie(req, SESSION_COOKIE);
  if (!raw || !secret()) return undefined;
  const [session] = await db.select().from(authSessionsTable).where(and(
    eq(authSessionsTable.tokenHash, digest(raw)),
    isNull(authSessionsTable.revokedAt),
    gt(authSessionsTable.expiresAt, new Date()),
  )).limit(1);
  if (!session) return undefined;
  if (req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS") {
    const csrf = csrfFromRequest(req);
    const header = req.get("x-csrf-token");
    if (!csrf || !header || !equal(csrf, header) || !equal(digest(csrf), session.csrfHash)) return undefined;
  }
  const [user] = await db.select().from(appUsersTable).where(eq(appUsersTable.clerkUserId, session.userId)).limit(1);
  return user;
}