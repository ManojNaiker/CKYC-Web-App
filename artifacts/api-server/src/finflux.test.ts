import assert from "node:assert/strict";
import { test } from "node:test";
import ExcelJS from "exceljs";
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
} from "./lib/finflux-update-jobs";

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
    return new Response("{}", { status: 201 });
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
});

test("update job processes records and exposes per-client outcomes", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
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
    return new Response("{}", { status: 201 });
  };

  try {
    const accepted = await createFinfluxCkycUpdateJob(
      { username: "operator", password: "test-only" },
      [
        { clientId: "LF-3001", ckycNumber: "12345678901234" },
        { clientId: "LF-3002", ckycNumber: "23456789012345" },
      ],
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
    assert.equal(job.results[0].status, "success");
    assert.equal(job.results[1].status, "failed");
    assert.equal(job.results[1].message, "Identifier already exists.");
    assert.equal(calls.length, 3);
  } finally {
    globalThis.fetch = originalFetch;
  }
});