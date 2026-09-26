import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { appUsersTable, authSessionsTable, db } from "@workspace/db";

let server: Server;
let baseUrl: string;
let adminPassword: string;
let createdUserId: string | undefined;

function getCookiePair(headers: Headers, name: string): string {
  const value = headers.get("set-cookie") ?? "";
  const match = value.match(new RegExp(`(?:^|,\\s*)${name}=([^;,]+)`));
  assert.ok(match, `Expected ${name} cookie`);
  return `${name}=${match[1]}`;
}

describe("local Admin authentication", () => {
  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.CKYC_TEST_AUTH_BYPASS = "0";
    const testPassword = randomBytes(24).toString("base64url");
    process.env.CKYC_ADMIN_PASSWORD = testPassword;
    process.env.SESSION_SECRET = randomBytes(32).toString("base64url");
    adminPassword = testPassword;

    const { default: app } = await import("./app");
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  after(async () => {
    if (createdUserId) {
      await db
        .delete(authSessionsTable)
        .where(eq(authSessionsTable.userId, createdUserId));
      await db
        .delete(appUsersTable)
        .where(eq(appUsersTable.clerkUserId, createdUserId));
    }
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it("rejects wrong credentials with one generic response and has no signup endpoint", async () => {
    const wrongUsername = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "someone", password: adminPassword }),
    });
    const wrongPassword = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Admin", password: "incorrect-password" }),
    });

    assert.equal(wrongUsername.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.deepEqual(await wrongUsername.json(), await wrongPassword.json());

    const signup = await fetch(`${baseUrl}/auth/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "new-user", password: "another-password" }),
    });
    assert.notEqual(signup.status, 200);
  });

  it("accepts the configured password without imposing an application-specific length policy", async () => {
    const originalPassword = process.env.CKYC_ADMIN_PASSWORD;
    process.env.CKYC_ADMIN_PASSWORD = "short-ok";
    try {
      const login = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: "Admin", password: "short-ok" }),
      });
      assert.equal(login.status, 200);
    } finally {
      process.env.CKYC_ADMIN_PASSWORD = originalPassword;
    }
  });

  it("creates an HttpOnly session, enforces CSRF, keeps Admin access, and revokes on logout", async () => {
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "Admin", password: adminPassword }),
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie") ?? "";
    const sessionCookieAttributes = setCookie.match(
      /(?:^|,\s*)ckyc_session=.*?(?=,\s*ckyc_csrf=|$)/i,
    )?.[0];
    const csrfCookieAttributes = setCookie.match(
      /(?:^|,\s*)ckyc_csrf=.*$/i,
    )?.[0];
    assert.ok(sessionCookieAttributes);
    assert.ok(csrfCookieAttributes);
    assert.match(sessionCookieAttributes, /HttpOnly/i);
    assert.match(sessionCookieAttributes, /SameSite=Lax/i);
    assert.match(csrfCookieAttributes, /SameSite=Lax/i);
    assert.doesNotMatch(csrfCookieAttributes, /HttpOnly/i);
    const csrfCookieValue = setCookie.match(/(?:^|,\s*)ckyc_csrf=([^;,]+)/)?.[1];
    assert.ok(csrfCookieValue);
    const cookies = `${getCookiePair(login.headers, "ckyc_session")}; ${getCookiePair(login.headers, "ckyc_csrf")}`;

    const me = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: cookies } });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as { user: { role: string } };
    assert.equal(meBody.user.role, "admin");

    const adminUsers = await fetch(`${baseUrl}/admin/users`, { headers: { cookie: cookies } });
    assert.equal(adminUsers.status, 200);
    const adminUsersBody = (await adminUsers.json()) as {
      users: Array<{ userId: string; username: string | null }>;
    };
    assert.ok(adminUsersBody.users.some((user) => user.userId === "local-admin"));

    const username = `member-${randomBytes(6).toString("hex")}`;
    const initialPassword = randomBytes(18).toString("base64url");
    const createUser = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Test Member",
        username: username.toUpperCase(),
        password: initialPassword,
        role: "manager",
      }),
    });
    assert.equal(createUser.status, 201);
    const createdBody = (await createUser.json()) as {
      user: {
        userId: string;
        username: string | null;
        email: string;
        role: string;
      };
    };
    createdUserId = createdBody.user.userId;
    assert.equal(createdBody.user.username, username);
    assert.equal(createdBody.user.email, `${username}@local.invalid`);
    assert.equal(createdBody.user.role, "manager");
    assert.equal("passwordHash" in createdBody.user, false);
    assert.equal("password" in createdBody.user, false);

    const duplicateUser = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Duplicate Member",
        username,
        password: initialPassword,
        role: "viewer",
      }),
    });
    assert.equal(duplicateUser.status, 409);

    const memberLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: initialPassword }),
    });
    assert.equal(memberLogin.status, 200);
    const memberCookies = `${getCookiePair(memberLogin.headers, "ckyc_session")}; ${getCookiePair(memberLogin.headers, "ckyc_csrf")}`;
    const memberMe = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie: memberCookies },
    });
    const memberBody = (await memberMe.json()) as { user: { role: string } };
    assert.equal(memberMe.status, 200);
    assert.equal(memberBody.user.role, "manager");

    const memberAdminList = await fetch(`${baseUrl}/admin/users`, {
      headers: { cookie: memberCookies },
    });
    assert.equal(memberAdminList.status, 403);

    const memberCsrf = decodeURIComponent(
      getCookiePair(memberLogin.headers, "ckyc_csrf").slice("ckyc_csrf=".length),
    );
    const memberCreate = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: {
        cookie: memberCookies,
        "content-type": "application/json",
        "x-csrf-token": memberCsrf,
      },
      body: JSON.stringify({
        fullName: "Blocked Member",
        username: `blocked-${randomBytes(6).toString("hex")}`,
        password: "not-created",
        role: "viewer",
      }),
    });
    assert.equal(memberCreate.status, 403);

    const wrongMemberPassword = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "wrong-password" }),
    });
    assert.equal(wrongMemberPassword.status, 401);
    assert.deepEqual(await wrongMemberPassword.json(), {
      error: "Invalid username or password.",
    });

    const rejectedLogout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: { cookie: cookies },
    });
    assert.equal(rejectedLogout.status, 403);

    const logout = await fetch(`${baseUrl}/auth/logout`, {
      method: "POST",
      headers: {
        cookie: cookies,
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
    });
    assert.equal(logout.status, 204);

    const afterLogout = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: cookies } });
    assert.equal(afterLogout.status, 401);
  });
});