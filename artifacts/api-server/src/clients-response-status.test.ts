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
    await pool.query("DELETE FROM clients WHERE loanid LIKE $1", [
      `${loanPrefix}%`,
    ]);
    await pool.end();
  });

  it("prefers safe Create matches in the list and export without changing other classifications", async () => {
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
       SET ckyc_number = $1, ckyc_response_id = $2, ckyc_response_matched_row = $3
       WHERE loanid = $4`,
      [
        createNumber,
        `RESPONSE-${runId}-CREATE`,
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
       SET ckyc_number = $1, ckyc_response_id = $2, ckyc_response_matched_row = $3
       WHERE loanid = $4`,
      [
        ambiguousNumberA,
        `RESPONSE-${runId}-AMBIGUOUS`,
        matchedRow(`RESPONSE-${runId}-AMBIGUOUS`, "UNRELATED PERSON"),
        `${loanPrefix}-ambiguous`,
      ],
    );
    await pool.query(
      "UPDATE clients SET ckyc_number = $1 WHERE loanid = $2",
      [rejectedNumber, `${loanPrefix}-rejected`],
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

    const exportResponse = await fetch(
      `${baseUrl}/clients/export?search=${encodeURIComponent(loanPrefix)}`,
    );
    assert.equal(exportResponse.status, 200);
    const csv = await exportResponse.text();
    const exportedStatuses = new Map(
      csv
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => line.split(","))
        .map((columns) => [columns[1]?.replaceAll('"', ""), columns[13]]),
    );
    assert.equal(
      exportedStatuses.get(`${loanPrefix}-create-match`),
      '"Match via Create CKYC"',
    );
    assert.equal(
      exportedStatuses.get(`${loanPrefix}-legacy-match`),
      '"Properly Match"',
    );
    assert.equal(
      exportedStatuses.get(`${loanPrefix}-ambiguous`),
      '"Not Match"',
    );
    assert.equal(exportedStatuses.get(`${loanPrefix}-rejected`), '""');
  });
});