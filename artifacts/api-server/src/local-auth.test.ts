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
let collisionUserId: string | undefined;
let legacyUserId: string | undefined;

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
    for (const userId of [createdUserId, collisionUserId, legacyUserId]) {
      if (!userId) continue;
      await db
        .delete(authSessionsTable)
        .where(eq(authSessionsTable.userId, userId));
      await db
        .delete(appUsersTable)
        .where(eq(appUsersTable.clerkUserId, userId));
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

    const bootstrapPasswordEdit = await fetch(`${baseUrl}/admin/users/local-admin`, {
      method: "PATCH",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Admin",
        email: "admin@local.invalid",
        username: "admin",
        password: "must-not-replace-the-secret",
        role: "admin",
      }),
    });
    assert.equal(bootstrapPasswordEdit.status, 409);

    const username = `member-${randomBytes(6).toString("hex")}`;
    const initialPassword = randomBytes(18).toString("base64url");
    const updatedUsername = `${username}-updated`;
    const updatedPassword = randomBytes(18).toString("base64url");
    const collisionUsername = `collision-${randomBytes(6).toString("hex")}`;
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

    const collisionUser = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Collision Member",
        username: collisionUsername,
        password: randomBytes(18).toString("base64url"),
        role: "viewer",
      }),
    });
    assert.equal(collisionUser.status, 201);
    const collisionBody = (await collisionUser.json()) as {
      user: { userId: string };
    };
    collisionUserId = collisionBody.user.userId;

    const conflictingEdit = await fetch(`${baseUrl}/admin/users/${createdUserId}`, {
      method: "PATCH",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Test Member",
        email: "test-member@example.com",
        username: collisionUsername,
        role: "manager",
      }),
    });
    assert.equal(conflictingEdit.status, 409);

    const updateUser = await fetch(`${baseUrl}/admin/users/${createdUserId}`, {
      method: "PATCH",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Updated Test Member",
        email: "updated-member@example.com",
        username: updatedUsername.toUpperCase(),
        password: updatedPassword,
        role: "manager",
      }),
    });
    assert.equal(updateUser.status, 200);
    const updatedBody = (await updateUser.json()) as {
      user: {
        userId: string;
        fullName: string;
        email: string;
        username: string | null;
        role: string;
      };
    };
    assert.equal(updatedBody.user.userId, createdUserId);
    assert.equal(updatedBody.user.fullName, "Updated Test Member");
    assert.equal(updatedBody.user.email, "updated-member@example.com");
    assert.equal(updatedBody.user.username, updatedUsername);
    assert.equal(updatedBody.user.role, "manager");
    assert.equal("passwordHash" in updatedBody.user, false);
    assert.equal("password" in updatedBody.user, false);

    const profileOnlyUpdate = await fetch(`${baseUrl}/admin/users/${createdUserId}`, {
      method: "PATCH",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Updated Test Member",
        email: "updated-member@example.com",
        username: updatedUsername,
        role: "manager",
      }),
    });
    assert.equal(profileOnlyUpdate.status, 200);

    legacyUserId = `legacy-${randomBytes(8).toString("hex")}`;
    await db.insert(appUsersTable).values({
      clerkUserId: legacyUserId,
      email: "legacy@example.com",
      fullName: "Legacy Member",
      username: null,
      passwordHash: null,
      role: "viewer",
    });
    const legacyProfileEdit = await fetch(`${baseUrl}/admin/users/${legacyUserId}`, {
      method: "PATCH",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Updated Legacy Member",
        email: "updated-legacy@example.com",
        username: null,
        role: "viewer",
      }),
    });
    assert.equal(legacyProfileEdit.status, 200);

    const legacyUsername = `legacy-${randomBytes(6).toString("hex")}`;
    const missingInitialPassword = await fetch(
      `${baseUrl}/admin/users/${legacyUserId}`,
      {
        method: "PATCH",
        headers: {
          cookie: cookies,
          "content-type": "application/json",
          "x-csrf-token": decodeURIComponent(csrfCookieValue),
        },
        body: JSON.stringify({
          fullName: "Updated Legacy Member",
          email: "updated-legacy@example.com",
          username: legacyUsername,
          role: "viewer",
        }),
      },
    );
    assert.equal(missingInitialPassword.status, 400);

    const legacyPassword = randomBytes(18).toString("base64url");
    const enableLegacyLogin = await fetch(`${baseUrl}/admin/users/${legacyUserId}`, {
      method: "PATCH",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Updated Legacy Member",
        email: "updated-legacy@example.com",
        username: legacyUsername,
        password: legacyPassword,
        role: "viewer",
      }),
    });
    assert.equal(enableLegacyLogin.status, 200);
    const legacyLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: legacyUsername, password: legacyPassword }),
    });
    assert.equal(legacyLogin.status, 200);

    const duplicateUser = await fetch(`${baseUrl}/admin/users`, {
      method: "POST",
      headers: {
        cookie: cookies,
        "content-type": "application/json",
        "x-csrf-token": decodeURIComponent(csrfCookieValue),
      },
      body: JSON.stringify({
        fullName: "Duplicate Member",
        username: updatedUsername,
        password: initialPassword,
        role: "viewer",
      }),
    });
    assert.equal(duplicateUser.status, 409);

    const oldLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: updatedUsername, password: initialPassword }),
    });
    assert.equal(oldLogin.status, 401);
    const memberLogin = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: updatedUsername, password: updatedPassword }),
    });
    assert.equal(memberLogin.status, 200);
    const memberCookies = `${getCookiePair(memberLogin.headers, "ckyc_session")}; ${getCookiePair(memberLogin.headers, "ckyc_csrf")}`;
    const memberMe = await fetch(`${baseUrl}/auth/me`, {
      headers: { cookie: memberCookies },
    });
    const memberBody = (await memberMe.json()) as {
      user: { role: string; fullName: string; email: string };
    };
    assert.equal(memberMe.status, 200);
    assert.equal(memberBody.user.role, "manager");
    assert.equal(memberBody.user.fullName, "Updated Test Member");
    assert.equal(memberBody.user.email, "updated-member@example.com");

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

    const memberEdit = await fetch(`${baseUrl}/admin/users/${createdUserId}`, {
      method: "PATCH",
      headers: {
        cookie: memberCookies,
        "content-type": "application/json",
        "x-csrf-token": memberCsrf,
      },
      body: JSON.stringify({
        fullName: "Blocked Edit",
        email: "blocked@example.com",
        username: updatedUsername,
        role: "viewer",
      }),
    });
    assert.equal(memberEdit.status, 403);

    const wrongMemberPassword = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: updatedUsername, password: "wrong-password" }),
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