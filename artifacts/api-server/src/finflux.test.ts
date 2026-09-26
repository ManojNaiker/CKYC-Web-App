import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import ExcelJS from "exceljs";
import { pool } from "@workspace/db";
import {
  FinfluxImportError,
  previewFinfluxImportFile,
} from "./lib/finflux-ckyc-import";
import {
  addFinfluxCkycIdentifier,
  authenticateWithFinflux,
  FinfluxAuthenticationError,
} from "./lib/finflux-client";
import {
  createFinfluxCkycUpdateJob,
  getFinfluxCkycUpdateJob,
  type FinfluxUpdateOutcome,
} from "./lib/finflux-update-jobs";
import { persistFinfluxUpdateOutcomes } from "./lib/finflux-update-status";

test("CSV preview validates required fields and marks duplicate client IDs", async () => {
  const csv = [
    "\uFEFFclient_id,ckyc_number",
    "LF-1001,12345678901234",
    "LF-1002,",
    "LF-1001,98765432109876",
    "LF-1003,11223344556677",
  ].join("\r\n");

  const preview = await previewFinfluxImportFile(
    "finflux-update.csv",
    Buffer.from(csv).toString("base64"),
  );

  assert.equal(preview.totalRows, 4);
  assert.equal(preview.validCount, 1);
  assert.equal(preview.invalidCount, 3);
  assert.deepEqual(preview.rows[0], {
    rowNumber: 2,
    clientId: "LF-1001",
    ckycNumber: "12345678901234",
    valid: false,
    error: "Duplicate client_id in this file.",
  });
  assert.equal(preview.rows[1].error, "Missing ckyc_number.");
  assert.equal(preview.rows[2].error, "Duplicate client_id in this file.");
  assert.equal(preview.rows[3].valid, true);
});

test("XLSX preview reads text identifiers and source row numbers", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Finflux updates");
  worksheet.addRow(["client_id", "ckyc_number"]);
  worksheet.addRow(["LF-2001", "00123456789012"]);
  const xlsx = Buffer.from(await workbook.xlsx.writeBuffer());

  const preview = await previewFinfluxImportFile(
    "finflux-update.xlsx",
    xlsx.toString("base64"),
  );

  assert.equal(preview.totalRows, 1);
  assert.equal(preview.validCount, 1);
  assert.equal(preview.rows[0].rowNumber, 2);
  assert.equal(preview.rows[0].clientId, "LF-2001");
  assert.equal(preview.rows[0].ckycNumber, "00123456789012");
});

test("preview rejects unsupported file extensions and missing columns", async () => {
  const contents = Buffer.from("client_id,wrong_column\nLF-1,123").toString(
    "base64",
  );

  await assert.rejects(
    previewFinfluxImportFile("finflux-update.xls", contents),
    FinfluxImportError,
  );
  await assert.rejects(
    previewFinfluxImportFile("finflux-update.csv", contents),
    /ckyc_number/,
  );
});

test("OAuth and CKYC identifier requests follow the Finflux contract", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    if (calls.length === 1) {
      return new Response('{"access_token":"test-token","expires_in":300}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      '{"officeId":336,"clientId":"LF/1001","resourceId":15733716}',
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  };

  const token = await authenticateWithFinflux(
    { username: "operator", password: "not-a-real-password" },
    fetchImpl,
  );
  const result = await addFinfluxCkycIdentifier(
    token,
    { clientId: "LF/1001", ckycNumber: "12345678901234" },
    fetchImpl,
  );

  assert.equal(calls[0].url, "https://light.finflux.io/fineract-provider/api/oauth/token");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    client_id: "access-token-app",
    grant_type: "password",
    isPasswordEncrypted: "false",
    username: "operator",
    password: "not-a-real-password",
  });
  assert.equal(
    calls[1].url,
    "https://light.finflux.io/fineract-provider/api/v1/clients/LF%2F1001/identifiers",
  );
  const headers = new Headers(calls[1].init.headers);
  assert.equal(headers.get("Authorization"), "Bearer test-token");
  assert.equal(headers.get("fineract-platform-tenantid"), "light");
  assert.deepEqual(JSON.parse(String(calls[1].init.body)), {
    documentTypeId: 2274,
    status: 200,
    documentKey: "12345678901234",
    locale: "en",
    dateFormat: "dd MMMM yyyy",
    unmask: "false",
  });
  assert.equal(result.success, true);
  assert.equal(result.statusCode, 201);
  assert.equal(result.resourceId, "15733716");
});

test("Finflux credential rejection is surfaced as a safe authentication error", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response('{"defaultUserMessage":"Invalid password"}', {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });

  await assert.rejects(
    authenticateWithFinflux(
      { username: "operator", password: "wrong" },
      fetchImpl,
    ),
    (error: unknown) =>
      error instanceof FinfluxAuthenticationError &&
      error.message === "Finflux login failed. Check the username and password.",
  );
});

test("non-success identifier response includes a bounded API message", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        errors: [{ defaultUserMessage: "Identifier could not be added." }],
      }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  const result = await addFinfluxCkycIdentifier(
    "test-token",
    { clientId: "LF-1001", ckycNumber: "12345678901234" },
    fetchImpl,
  );

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 409);
  assert.equal(result.message, "Identifier could not be added.");
  assert.equal(result.authorizationRejected, false);
});

test("Finflux resource-integrity 403 is treated as a row failure, not a batch-wide authorization failure", async () => {
  const fetchImpl: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        errors: [
          {
            defaultUserMessage: "Unknown data integrity issue with resource.",
          },
        ],
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  const result = await addFinfluxCkycIdentifier(
    "test-token",
    { clientId: "LF-1001", ckycNumber: "12345678901234" },
    fetchImpl,
  );

  assert.equal(result.success, false);
  assert.equal(result.statusCode, 403);
  assert.equal(result.authorizationRejected, false);
});

test("update job processes records and exposes per-client outcomes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const persistedRecords: FinfluxUpdateOutcome[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/oauth/token")) {
      return new Response('{"access_token":"job-test-token"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/LF-3002/identifiers")) {
      return new Response(
        '{"errors":[{"defaultUserMessage":"Identifier already exists."}]}',
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/LF-3001/identifiers")) {
      return new Response(
        '{"officeId":336,"clientId":"LF-3001","resourceId":15733716}',
        { status: 201, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 201 });
  };

  try {
    const accepted = await createFinfluxCkycUpdateJob(
      { username: "operator", password: "test-only" },
      [
        { clientId: "LF-3001", ckycNumber: "12345678901234" },
        { clientId: "LF-3002", ckycNumber: "23456789012345" },
      ],
      async (updates) => { persistedRecords.push(...updates); },
    );

    let job = getFinfluxCkycUpdateJob(accepted.id);
    for (let attempt = 0; attempt < 50 && job?.status === "running"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      job = getFinfluxCkycUpdateJob(accepted.id);
    }

    assert.ok(job);
    assert.equal(job.status, "completed");
    assert.equal(job.total, 2);
    assert.equal(job.processed, 2);
    assert.equal(job.successCount, 1);
    assert.equal(job.failureCount, 1);
    assert.equal(job.notAttemptedCount, 0);
    assert.equal(job.results[0].status, "success");
    assert.equal(job.results[0].attempted, true);
    assert.equal(job.results[0].resourceId, "15733716");
    assert.equal(job.results[1].status, "failed");
    assert.equal(job.results[1].attempted, true);
    assert.equal(job.results[1].message, "Identifier already exists.");
    assert.deepEqual(persistedRecords, [
      {
        jobId: accepted.id,
        clientId: "LF-3001",
        ckycNumber: "12345678901234",
        status: "success",
        error: null,
        statusCode: 201,
        resourceId: "15733716",
      },
      {
        jobId: accepted.id,
        clientId: "LF-3002",
        ckycNumber: "23456789012345",
        status: "failed",
        error: "Identifier already exists.",
        statusCode: 409,
        resourceId: null,
      },
    ]);
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failed FinFlux attempts persist without replacing confirmed updates", async () => {
  const clientId = `FINFLUX-RESOURCE-TEST-${randomUUID()}`;
  const ckycNumber = "12345678901234";
  const jobId = randomUUID();

  try {
    await persistFinfluxUpdateOutcomes([{
      jobId,
      clientId,
      ckycNumber,
      status: "success",
      error: null,
      statusCode: 201,
      resourceId: "15733716",
    }]);
    const inserted = await pool.query<{ resource_id: string | null; status_code: number }>(
      "SELECT resource_id, status_code FROM finflux_ckyc_updates WHERE client_id = $1 AND ckyc_number = $2",
      [clientId, ckycNumber],
    );
    assert.equal(inserted.rows[0]?.resource_id, "15733716");

    await persistFinfluxUpdateOutcomes([{
      jobId: randomUUID(),
      clientId,
      ckycNumber,
      status: "success",
      error: null,
      statusCode: 200,
      resourceId: null,
    }]);
    const updated = await pool.query<{ resource_id: string | null; status_code: number }>(
      "SELECT resource_id, status_code FROM finflux_ckyc_updates WHERE client_id = $1 AND ckyc_number = $2",
      [clientId, ckycNumber],
    );
    assert.equal(updated.rows[0]?.resource_id, "15733716");
    assert.equal(updated.rows[0]?.status_code, 200);

    await persistFinfluxUpdateOutcomes([{
      jobId: randomUUID(),
      clientId,
      ckycNumber,
      status: "failed",
      error: "FinFlux temporarily unavailable.",
      statusCode: 503,
      resourceId: null,
    }]);
    const stillConfirmed = await pool.query<{ resource_id: string | null; status_code: number }>(
      "SELECT resource_id, status_code FROM finflux_ckyc_updates WHERE client_id = $1 AND ckyc_number = $2",
      [clientId, ckycNumber],
    );
    assert.equal(stillConfirmed.rows[0]?.resource_id, "15733716");
    assert.equal(stillConfirmed.rows[0]?.status_code, 200);

    const latestAttempt = await pool.query<{
      job_id: string;
      status: string;
      error: string | null;
      status_code: number | null;
    }>(
      "SELECT job_id, status, error, status_code FROM finflux_ckyc_attempts WHERE client_id = $1 AND ckyc_number = $2",
      [clientId, ckycNumber],
    );
    assert.equal(latestAttempt.rows[0]?.status, "failed");
    assert.equal(latestAttempt.rows[0]?.error, "FinFlux temporarily unavailable.");
    assert.equal(latestAttempt.rows[0]?.status_code, 503);
  } finally {
    await pool.query(
      "DELETE FROM finflux_ckyc_attempts WHERE client_id = $1 AND ckyc_number = $2",
      [clientId, ckycNumber],
    );
    await pool.query(
      "DELETE FROM finflux_ckyc_updates WHERE client_id = $1 AND ckyc_number = $2",
      [clientId, ckycNumber],
    );
  }
});

test("update job continues after a resource-integrity 403 for one client", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/oauth/token")) {
      return new Response('{"access_token":"job-integrity-test-token"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.endsWith("/LF-4001/identifiers")) {
      return new Response(
        '{"errors":[{"defaultUserMessage":"Unknown data integrity issue with resource."}]}',
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("{}", { status: 201 });
  };

  try {
    const accepted = await createFinfluxCkycUpdateJob(
      { username: "operator", password: "test-only" },
      [
        { clientId: "LF-4001", ckycNumber: "12345678901234" },
        { clientId: "LF-4002", ckycNumber: "23456789012345" },
      ],
    );

    let job = getFinfluxCkycUpdateJob(accepted.id);
    for (let attempt = 0; attempt < 50 && job?.status === "running"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      job = getFinfluxCkycUpdateJob(accepted.id);
    }

    assert.ok(job);
    assert.equal(job.status, "completed");
    assert.equal(job.processed, 2);
    assert.equal(job.successCount, 1);
    assert.equal(job.failureCount, 1);
    assert.equal(job.results[0].message, "Unknown data integrity issue with resource.");
    assert.equal(job.results[1].status, "success");
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("update job stops remaining rows after an authorization 403", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/oauth/token")) {
      return new Response('{"access_token":"job-auth-test-token"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      '{"errors":[{"defaultUserMessage":"User is not authorized to update client identifiers."}]}',
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const accepted = await createFinfluxCkycUpdateJob(
      { username: "operator", password: "test-only" },
      [
        { clientId: "LF-4011", ckycNumber: "12345678901234" },
        { clientId: "LF-4012", ckycNumber: "23456789012345" },
      ],
    );

    let job = getFinfluxCkycUpdateJob(accepted.id);
    for (let attempt = 0; attempt < 50 && job?.status === "running"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      job = getFinfluxCkycUpdateJob(accepted.id);
    }

    assert.ok(job);
    assert.equal(job.status, "failed");
    assert.equal(job.processed, 2);
    assert.equal(job.failureCount, 1);
    assert.equal(job.notAttemptedCount, 1);
    assert.equal(job.results[1].message, "Finflux rejected authorization for this write. Remaining records were not attempted.");
    assert.equal(job.results[0].attempted, true);
    assert.equal(job.results[1].attempted, false);
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});