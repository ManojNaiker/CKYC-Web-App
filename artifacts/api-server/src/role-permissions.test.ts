import assert from "node:assert/strict";
import test from "node:test";
import { canAccessApiPath } from "./lib/role-permissions";

test("viewers can read the dashboard and client register only", () => {
  assert.equal(canAccessApiPath("viewer", "/dashboard/summary", "GET"), true);
  assert.equal(canAccessApiPath("viewer", "/clients", "GET"), true);
  assert.equal(canAccessApiPath("viewer", "/clients/123", "GET"), true);
  assert.equal(canAccessApiPath("viewer", "/clients", "POST"), false);
  assert.equal(
    canAccessApiPath(
      "viewer",
      "/clients/123/ckyc-response/restore",
      "POST",
    ),
    false,
  );
  assert.equal(canAccessApiPath("viewer", "/ckyc/requests", "GET"), false);
  assert.equal(canAccessApiPath("viewer", "/admin/users", "GET"), false);
});

test("managers can operate CKYC workflows but not admin or FinFlux routes", () => {
  assert.equal(canAccessApiPath("manager", "/dashboard/summary", "GET"), true);
  assert.equal(canAccessApiPath("manager", "/clients", "POST"), true);
  assert.equal(
    canAccessApiPath(
      "manager",
      "/clients/123/ckyc-response/restore",
      "POST",
    ),
    true,
  );
  assert.equal(canAccessApiPath("manager", "/ckyc/requests", "POST"), true);
  assert.equal(
    canAccessApiPath("manager", "/ckyc/download-requests/42/file", "GET"),
    true,
  );
  assert.equal(canAccessApiPath("manager", "/finflux/update", "POST"), false);
  assert.equal(canAccessApiPath("manager", "/admin/audit-trails", "GET"), false);
});

test("admins can access all application sections but unknown API paths fail closed", () => {
  assert.equal(canAccessApiPath("admin", "/finflux/update", "POST"), true);
  assert.equal(
    canAccessApiPath(
      "admin",
      "/clients/123/ckyc-response/restore",
      "POST",
    ),
    true,
  );
  assert.equal(canAccessApiPath("admin", "/admin/users", "GET"), true);
  assert.equal(canAccessApiPath("admin", "/audit-trails", "GET"), false);
  assert.equal(canAccessApiPath("admin", "/unknown", "GET"), false);
});