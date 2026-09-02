import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import app from "./app";
import { pool } from "@workspace/db";

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

type ImportResult = {
  imported: number;
  skipped: number;
  fileName: string | null;
};

type ClientRecord = {
  id: number;
  loanid: string;
  ClientName: string;
  Client_UID: string;
  Client_VID: string;
  Client_PAN: string;
};

type CkycFile = {
  id: number;
  fileName: string;
  recordCount: number;
  status: "generated" | "response_uploaded";
  content: string;
  responseFileName: string | null;
  responseContent?: string | null;
};

function parseLmsCsv(csv: string): ClientInput[] {
  const [headerLine, ...dataLines] = csv.trim().split(/\r?\n/);
  const headers = headerLine.split(",");

  return dataLines.map((line) => {
    const values = line.split(",");
    return Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? ""]),
    ) as ClientInput;
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

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

describe("CKYC file workflow", () => {
  let server: Server;
  let baseUrl: string;
  let requestId: number | undefined;
  const runId = `${Date.now()}-${process.pid}`;
  const loanPrefix = `workflow-regression-${runId}`;

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
    if (requestId !== undefined) {
      await pool.query("DELETE FROM ckyc_requests WHERE id = $1", [requestId]);
    }
    await pool.query("DELETE FROM clients WHERE loanid LIKE $1", [
      `${loanPrefix}%`,
    ]);
    await pool.end();
  });

  it("imports LMS rows, generates CKYC content, and stores a matching response", async () => {
    const fileName = `${loanPrefix}.csv`;
    const rows = parseLmsCsv(`loanid,ClientID,disbursedon_date,Client_UID,Client_VID,Client_PAN,ClientName,mobile_no,alternate_mobile_no,Gender,date_of_birth
${loanPrefix}-1,CLI-${runId}-1,01-01-2026,1234 5678 9012,VID-${runId}-1,ABCDE1234F,  Asha   Rao  ,9876543210,9123456780,F,02-04-1990
${loanPrefix}-2,CLI-${runId}-2,02-01-2026,9876-5432-1098,,PQRSX5678K,Bharat Kumar,9876543211,,M,15-08-1988
${loanPrefix}-3,CLI-${runId}-3,03-01-2026,,,,No Identifier,9876543212,,F,20-12-1995`);

    const imported = await requestJson<ImportResult>(baseUrl, "/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, rows }),
    });

    assert.deepEqual(imported, {
      imported: 3,
      skipped: 0,
      fileName,
    });

    const clientList = await requestJson<{
      items: ClientRecord[];
      total: number;
    }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&pageSize=10`,
    );
    assert.equal(clientList.total, 3);
    const asha = clientList.items.find((client) =>
      client.loanid.endsWith("-1"),
    );
    const bharat = clientList.items.find((client) =>
      client.loanid.endsWith("-2"),
    );
    assert.ok(asha);
    assert.ok(bharat);
    assert.equal(asha.ClientName, "Asha Rao");

    const defaults = {
      fileDate: "02092026",
      version: "V1.1",
      institutionCode: "IN2884",
      documentSetName: "D00003",
    };
    const generated = await requestJson<CkycFile>(baseUrl, "/ckyc/requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...defaults,
        rowCount: "5",
        clients: [
          {
            clientId: asha.id,
            name: asha.ClientName,
            dateOfBirth: "02-04-1990",
            gender: "F",
            searchType: "E",
            searchValue: "9012",
            sequence: 1,
          },
          {
            clientId: asha.id,
            name: asha.ClientName,
            dateOfBirth: "02-04-1990",
            gender: "F",
            searchType: "B",
            searchValue: `VID-${runId}-1`,
            sequence: 2,
          },
          {
            clientId: asha.id,
            name: asha.ClientName,
            dateOfBirth: "02-04-1990",
            gender: "F",
            searchType: "B",
            searchValue: "ABCDE1234F",
            sequence: 3,
          },
          {
            clientId: bharat.id,
            name: "Bharat Kumar",
            dateOfBirth: "15-08-1988",
            gender: "M",
            searchType: "E",
            searchValue: "1098",
            sequence: 4,
          },
          {
            clientId: bharat.id,
            name: "Bharat Kumar",
            dateOfBirth: "15-08-1988",
            gender: "M",
            searchType: "B",
            searchValue: "PQRSX5678K",
            sequence: 5,
          },
        ],
      }),
    });
    requestId = generated.id;

    assert.match(
      generated.fileName,
      new RegExp(`^IN2884_02092026_V1\\.1_S\\d{5}\\.txt$`),
    );
    const generatedSerial = Number(generated.fileName.match(/_S(\d+)\.txt$/)?.[1]);
    assert.ok(generatedSerial >= 10001);
    assert.equal(generated.recordCount, 5);
    assert.equal(generated.status, "generated");
    assert.deepEqual(generated.content.trimEnd().split("\r\n"), [
      "10|IN2884|1|5|V1.1|02-09-2026||||",
      "20|1|E|9012|Asha Rao|02-04-1990|F|",
      "20|2|B|VID-" + runId + "-1||||",
      "20|3|B|ABCDE1234F||||",
      "20|4|E|1098|Bharat Kumar|15-08-1988|M|",
      "20|5|B|PQRSX5678K||||",
    ]);

    const responseFileName = `${loanPrefix}-response.txt`;
    const responseContent = `10|00003|IN2884|response-${runId}`;
    const uploaded = await requestJson<CkycFile>(
      baseUrl,
      `/ckyc/requests/${generated.id}/response`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: responseFileName,
          content: responseContent,
        }),
      },
    );

    assert.equal(uploaded.id, generated.id);
    assert.equal(uploaded.status, "response_uploaded");
    assert.equal(uploaded.responseFileName, responseFileName);
    assert.equal(uploaded.responseContent, responseContent);

    const detail = await requestJson<CkycFile>(
      baseUrl,
      `/ckyc/requests/${generated.id}`,
    );
    assert.equal(detail.fileName, generated.fileName);
    assert.equal(detail.content, generated.content);
    assert.equal(detail.responseFileName, responseFileName);
    assert.equal(detail.responseContent, responseContent);
  });
});