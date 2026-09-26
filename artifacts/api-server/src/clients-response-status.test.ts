import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { pool } from "@workspace/db";
import app from "./app";

type ClientInput = {
  loanid: string;
  ClientID: string;
  disbursedon_date: string;
  Client_UID: string;
  Client_VID: string;
  Client_PAN: string;
  ClientName: string;
  mobile_no: string;
  alternate_mobile_no: string;
  Gender: string;
  date_of_birth: string;
};

const LMS_HEADERS = [
  "loanid",
  "ClientID",
  "disbursedon_date",
  "Client_UID",
  "Client_VID",
  "Client_PAN",
  "ClientName",
  "mobile_no",
  "alternate_mobile_no",
  "Gender",
  "date_of_birth",
];

async function requestJson<T>(
  baseUrl: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = (await response.json()) as T & { error?: string };
  assert.equal(
    response.ok,
    true,
    `Expected ${response.status} from ${path}: ${body.error ?? "unknown error"}`,
  );
  return body;
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("CKYC response match status", () => {
  let server: Server;
  let baseUrl: string;
  let createImportId: number | undefined;
  const runId = `${Date.now()}-${process.pid}`;
  const loanPrefix = `response-status-${runId}`;

  before(async () => {
    server = createServer(app);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  after(async () => {
    await closeServer(server);
    if (createImportId !== undefined) {
      await pool.query("DELETE FROM ckyc_create_data WHERE import_id = $1", [
        createImportId,
      ]);
      await pool.query("DELETE FROM ckyc_create_data_imports WHERE id = $1", [
        createImportId,
      ]);
    }
    await pool.query("DELETE FROM finflux_ckyc_attempts WHERE client_id LIKE $1", [
      `CLI-${runId}%`,
    ]);
    await pool.query("DELETE FROM clients WHERE loanid LIKE $1", [
      `${loanPrefix}%`,
    ]);
    await pool.end();
  });

  it("prefers safe Create matches in the list and export without changing other classifications", async () => {
    const dashboardBefore = await requestJson<{
      recordsPending: number;
      pendingErrors: Array<{ name: string; count: number }>;
      finfluxFailed: number;
    }>(baseUrl, "/dashboard/summary");
    const rows: ClientInput[] = [
      {
        loanid: `${loanPrefix}-create-match`,
        ClientID: `CLI-${runId}-create-match`,
        disbursedon_date: "2026-01-02",
        Client_UID: "123456789012",
        Client_VID: `VID-${runId}-1`,
        Client_PAN: "ABCDE1234F",
        ClientName: "Asha Rao",
        mobile_no: "9876543210",
        alternate_mobile_no: "",
        Gender: "F",
        date_of_birth: "02-04-1990",
      },
      {
        loanid: `${loanPrefix}-legacy-match`,
        ClientID: `CLI-${runId}-legacy-match`,
        disbursedon_date: "2026-01-02",
        Client_UID: "223456789012",
        Client_VID: `VID-${runId}-2`,
        Client_PAN: "BCDEF1234G",
        ClientName: "Bharat Kumar",
        mobile_no: "9876543211",
        alternate_mobile_no: "",
        Gender: "M",
        date_of_birth: "03-05-1991",
      },
      {
        loanid: `${loanPrefix}-ambiguous`,
        ClientID: `CLI-${runId}-ambiguous`,
        disbursedon_date: "2026-01-02",
        Client_UID: "323456789012",
        Client_VID: `VID-${runId}-3`,
        Client_PAN: "CDEFG1234H",
        ClientName: "Chetan Shah",
        mobile_no: "9876543212",
        alternate_mobile_no: "",
        Gender: "M",
        date_of_birth: "04-06-1992",
      },
      {
        loanid: `${loanPrefix}-rejected`,
        ClientID: `CLI-${runId}-rejected`,
        disbursedon_date: "2026-01-02",
        Client_UID: "423456789012",
        Client_VID: `VID-${runId}-4`,
        Client_PAN: "DEFGH1234J",
        ClientName: "Devika Patel",
        mobile_no: "9876543213",
        alternate_mobile_no: "",
        Gender: "F",
        date_of_birth: "05-07-1993",
      },
    ];

    await requestJson(baseUrl, "/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName: `${loanPrefix}.csv`, headers: LMS_HEADERS, rows }),
    });

    const createNumber = `O${String(process.pid).padStart(12, "0")}01`;
    const ambiguousNumberA = `O${String(process.pid).padStart(12, "0")}02`;
    const ambiguousNumberB = `O${String(process.pid).padStart(12, "0")}03`;
    const rejectedNumber = `O${String(process.pid).padStart(12, "0")}04`;
    const matchedRow = (id: string, name: string) =>
      `20|1|E|1234|${id}|${name}||||`;

    await pool.query(
      `UPDATE clients
       SET ckyc_number = $1, ckyc_response_id = NULL,
           ckyc_response_status = 'error', ckyc_response_error = $2,
           ckyc_response_matched_row = $3
       WHERE loanid = $4`,
      [
        createNumber,
        `Create-resolved-response-error-${runId}`,
        matchedRow(`RESPONSE-${runId}-CREATE`, "UNRELATED PERSON"),
        `${loanPrefix}-create-match`,
      ],
    );
    await pool.query(
      `UPDATE clients
       SET ckyc_response_id = $1, ckyc_response_matched_row = $2
       WHERE loanid = $3`,
      [
        `RESPONSE-${runId}-LEGACY`,
        matchedRow(`RESPONSE-${runId}-LEGACY`, "BHARAT KUMAR"),
        `${loanPrefix}-legacy-match`,
      ],
    );
    await pool.query(
      `UPDATE clients
       SET ckyc_number = $1, ckyc_response_id = NULL,
           ckyc_response_status = 'error', ckyc_response_error = $2,
           ckyc_response_matched_row = $3
       WHERE loanid = $4`,
      [
        ambiguousNumberA,
        `Ambiguous-create-error-${runId}`,
        matchedRow(`RESPONSE-${runId}-AMBIGUOUS`, "UNRELATED PERSON"),
        `${loanPrefix}-ambiguous`,
      ],
    );
    await pool.query(
      "UPDATE clients SET ckyc_number = $1 WHERE loanid = $2",
      [rejectedNumber, `${loanPrefix}-rejected`],
    );
    const finfluxFailureMessage = `FinFlux-write-error-${runId}`;
    await pool.query(
      `INSERT INTO finflux_ckyc_attempts (
         job_id, client_id, ckyc_number, status, error, status_code
       ) VALUES ($1, $2, $3, 'failed', $4, 503)`,
      [
        `job-${runId}`,
        rows[3].ClientID,
        rejectedNumber,
        finfluxFailureMessage,
      ],
    );

    const createImport = await pool.query<{ id: number }>(
      `INSERT INTO ckyc_create_data_imports (source_file_name, row_count)
       VALUES ($1, 5)
       RETURNING id`,
      [`${loanPrefix}-create.xlsx`],
    );
    createImportId = createImport.rows[0].id;
    const createRows = [
      {
        clientId: rows[0].ClientID,
        number: createNumber,
        status: "Success",
      },
      {
        clientId: rows[0].ClientID,
        number: createNumber,
        status: "success",
      },
      {
        clientId: rows[2].ClientID,
        number: ambiguousNumberA,
        status: "success",
      },
      {
        clientId: rows[2].ClientID,
        number: ambiguousNumberB,
        status: "success",
      },
      {
        clientId: rows[3].ClientID,
        number: rejectedNumber,
        status: "rejected",
      },
    ];

    for (const [index, row] of createRows.entries()) {
      await pool.query(
        `INSERT INTO ckyc_create_data (
           import_id, source_file_name, ref_id, client_id,
           uploaded_ckyc_number, status
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          createImportId,
          `${loanPrefix}-create.xlsx`,
          `ref-${runId}-${index}`,
          row.clientId,
          row.number,
          row.status,
        ],
      );
    }

    const clientList = await requestJson<{
      items: Array<{
        loanid: string;
        ckycResponseMatchStatus: string | null;
        ckycResponseStatus: "matched" | "error" | null;
        finfluxStatus: "updated" | "failed" | "pending" | null;
        finfluxError: string | null;
        finfluxStatusCode: number | null;
      }>;
    }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&pageSize=20`,
    );
    const listStatusByLoanId = new Map(
      clientList.items.map((client) => [
        client.loanid,
        client.ckycResponseMatchStatus,
      ]),
    );
    assert.equal(
      listStatusByLoanId.get(`${loanPrefix}-create-match`),
      "Match via Create CKYC",
    );
    assert.equal(
      listStatusByLoanId.get(`${loanPrefix}-legacy-match`),
      "Properly Match",
    );
    assert.equal(listStatusByLoanId.get(`${loanPrefix}-ambiguous`), "Not Match");
    assert.equal(listStatusByLoanId.get(`${loanPrefix}-rejected`), null);
    assert.equal(
      clientList.items.find(
        (client) => client.loanid === `${loanPrefix}-create-match`,
      )?.ckycResponseStatus,
      "error",
      "the saved response error remains available as history",
    );
    const failedFinfluxClient = clientList.items.find(
      (client) => client.loanid === `${loanPrefix}-rejected`,
    );
    assert.equal(failedFinfluxClient?.finfluxStatus, "failed");
    assert.equal(failedFinfluxClient?.finfluxError, finfluxFailureMessage);
    assert.equal(failedFinfluxClient?.finfluxStatusCode, 503);

    const pendingClients = await requestJson<{ total: number }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&status=pending`,
    );
    const errorClients = await requestJson<{ total: number }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&status=error`,
    );
    const matchedClients = await requestJson<{ total: number }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&status=matched`,
    );
    assert.equal(pendingClients.total, 0);
    assert.equal(errorClients.total, 0);
    assert.equal(matchedClients.total, 4);

    const dashboardAfter = await requestJson<{
      recordsPending: number;
      pendingErrors: Array<{ name: string; count: number }>;
      finfluxFailed: number;
      finfluxErrors: Array<{ name: string; count: number }>;
    }>(baseUrl, "/dashboard/summary");
    assert.equal(dashboardAfter.recordsPending, dashboardBefore.recordsPending);
    assert.equal(dashboardAfter.finfluxFailed, dashboardBefore.finfluxFailed + 1);
    assert.equal(
      dashboardAfter.finfluxErrors.some(
        (error) => error.name === finfluxFailureMessage && error.count === 1,
      ),
      true,
    );
    assert.equal(
      dashboardAfter.pendingErrors.some(
        (error) =>
          error.name === `Create-resolved-response-error-${runId}` ||
          error.name === `Ambiguous-create-error-${runId}`,
      ),
      false,
    );

    const exportResponse = await fetch(
      `${baseUrl}/clients/export?search=${encodeURIComponent(loanPrefix)}`,
    );
    assert.equal(exportResponse.status, 200);
    const csv = await exportResponse.text();
    const exportedRowsByLoanId = new Map(
      csv
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.split(","))
        .map((columns) => [
          columns[1]?.replaceAll('"', "") ?? "",
          columns,
        ] as const),
    );
    assert.equal(
      exportedRowsByLoanId.get(`${loanPrefix}-create-match`)?.[10],
      '"Final CKYC available"',
    );
    assert.equal(
      exportedRowsByLoanId.get(`${loanPrefix}-create-match`)?.[13],
      '"Match via Create CKYC"',
    );
    assert.equal(
      exportedRowsByLoanId.get(`${loanPrefix}-legacy-match`)?.[13],
      '"Properly Match"',
    );
    assert.equal(
      exportedRowsByLoanId.get(`${loanPrefix}-ambiguous`)?.[10],
      '"Final CKYC available"',
    );
    assert.equal(
      exportedRowsByLoanId.get(`${loanPrefix}-ambiguous`)?.[13],
      '"Not Match"',
    );
    assert.equal(exportedRowsByLoanId.get(`${loanPrefix}-rejected`)?.[10], '"Final CKYC available"');
    assert.equal(exportedRowsByLoanId.get(`${loanPrefix}-rejected`)?.[13], '""');
  });
});