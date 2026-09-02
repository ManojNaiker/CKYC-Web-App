import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import app from "./app";
import { pool } from "@workspace/db";
import { createClientsCsv } from "./routes/clients";
import ExcelJS from "exceljs";

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
  duplicates: number;
  fileName: string | null;
};

type ClientRecord = {
  id: number;
  loanid: string;
  ClientName: string;
  Client_UID: string;
  Client_VID: string;
  Client_PAN: string;
  ckycResponseId: string | null;
  ckycNumber: string | null;
  ckycResponseStatus: "matched" | "error" | null;
  ckycResponseError: string | null;
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
  let downloadRequestId: number | undefined;
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
    if (downloadRequestId !== undefined) {
      await pool.query("DELETE FROM ckyc_download_requests WHERE id = $1", [
        downloadRequestId,
      ]);
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
      body: JSON.stringify({ fileName, headers: LMS_HEADERS, rows }),
    });

    assert.deepEqual(imported, {
      imported: 3,
      skipped: 0,
      duplicates: 0,
      fileName,
    });

    const repeatedImport = await requestJson<ImportResult>(baseUrl, "/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, headers: LMS_HEADERS, rows }),
    });
    assert.deepEqual(repeatedImport, {
      imported: 0,
      skipped: 0,
      duplicates: 3,
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
    const responseContent = [
      "10|IN2884|1|5|V1.1|02-09-2026||||",
       "20|1|E|9012|PREFIXINTEST12345678|ASHA RAO|04|03|04|04|04|04|XXXXXXXXXX3210|04|||",
      "20|2|B|VID-" + runId + "-1|||||||||KYC Number does not exist for this identity type and number||||",
      "20|3|B|ABCDE1234F|||||||||KYC Number does not exist for this identity type and number||||",
      "20|4|E|1098|||||||||KYC Number does not exist for this identity type and number||||",
      "20|5|B|PQRSX5678K|||||||||KYC Number does not exist for this identity type and number||||",
    ].join("\r\n");
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

    const clientsWithResponses = await requestJson<{
      items: ClientRecord[];
      total: number;
    }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&pageSize=10`,
    );
    const updatedAsha = clientsWithResponses.items.find((client) =>
      client.loanid.endsWith("-1"),
    );
    const updatedBharat = clientsWithResponses.items.find((client) =>
      client.loanid.endsWith("-2"),
    );
    const noIdentifier = clientsWithResponses.items.find((client) =>
      client.loanid.endsWith("-3"),
    );

    const matchedClients = await requestJson<{
      items: ClientRecord[];
      total: number;
    }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&status=matched&pageSize=1`,
    );
    assert.equal(updatedAsha?.ckycResponseStatus, "matched");
    assert.equal(updatedAsha?.ckycResponseId, "PREFIXINTEST12345678");
    assert.equal(updatedAsha?.ckycResponseError, null);
    assert.equal(updatedBharat?.ckycResponseStatus, "error");
    assert.equal(updatedBharat?.ckycResponseId, null);
    assert.match(
      updatedBharat?.ckycResponseError ?? "",
      /KYC Number does not exist/,
    );
    assert.ok(noIdentifier);
    await pool.query(
      "UPDATE clients SET ckyc_response_id = $1, ckyc_response_status = 'matched', ckyc_number = $2 WHERE id = $3",
      ["PREFIXINWITHKYCNUMBER", "30064364932165", noIdentifier.id],
    );

    const repeatResponse = await fetch(`${baseUrl}/ckyc/requests`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...defaults,
        rowCount: "2",
        clients: [
          {
            clientId: asha.id,
            name: asha.ClientName,
            dateOfBirth: "02-04-1990",
            gender: "F",
            searchType: "B",
            searchValue: "ABCDE1234F",
            sequence: 1,
          },
          {
            clientId: bharat.id,
            name: bharat.ClientName,
            dateOfBirth: "15-08-1988",
            gender: "M",
            searchType: "B",
            searchValue: "PQRSX5678K",
            sequence: 2,
          },
        ],
      }),
    });
    assert.equal(repeatResponse.status, 400);

    const downloaded = await requestJson<{
      id: number;
      requestNumber: number;
      fileName: string;
      recordCount: number;
      content: string;
    }>(baseUrl, "/ckyc/download-requests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientIds: [asha.id],
        fileDate: "26022026",
        institutionCode: "IN2884",
        version: "V1.3",
        iraCode: "IRA010815",
      }),
    });
    downloadRequestId = downloaded.id;
    assert.ok(downloaded.requestNumber >= 10701);
    assert.equal(
      downloaded.fileName,
      `IN2884_1_26022026_V1.3_IRA010815_D${downloaded.requestNumber}.txt`,
    );
    assert.equal(downloaded.recordCount, 1);
    assert.equal(
      downloaded.content,
      `10|${downloaded.requestNumber}|IN2884|1|1BR|1|||||\r\n60|INTEST12345678|02-04-1990|1||\r\n`,
    );
    assert.doesNotMatch(downloaded.content, /INWITHKYCNUMBER/);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("CKYC Result");
    sheet.addRow([
      "Applicant Name",
      "KYC Number",
      "ALPHANUMERIC Reference NO",
    ]);
    sheet.addRow([
      "Asha Rao",
      "30064364932166",
      "INTEST12345678",
    ]);
    const fileContentBase64 = Buffer.from(
      await workbook.xlsx.writeBuffer(),
    ).toString("base64");
    const responseImported = await requestJson<{
      updatedCount: number;
      skippedCount: number;
      missingReferences: string[];
    }>(baseUrl, "/ckyc/download-requests/response", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceFileName: "portal-download-response.xlsx",
        fileContentBase64,
      }),
    });
    assert.deepEqual(responseImported, {
      sourceFileName: "portal-download-response.xlsx",
      updatedCount: 1,
      skippedCount: 0,
      missingReferences: [],
    });

    const finalClients = await requestJson<{
      items: ClientRecord[];
      total: number;
    }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(`${loanPrefix}-1`)}&pageSize=10`,
    );
    assert.equal(finalClients.items[0]?.ckycNumber, "30064364932166");
  });

  it("escapes CKYC result reports for CSV and spreadsheet safety", () => {
    const csv = createClientsCsv([
      {
        clientId: "=danger",
        loanid: "loan,1",
        clientName: 'Asha "Ace" Rao',
        ckycResponseId: "IN123",
        ckycNumber: null,
        ckycResponseStatus: "matched",
        ckycResponseError: null,
      },
    ]);

    assert.match(csv, /"'=danger"/);
    assert.match(csv, /"loan,1"/);
    assert.match(csv, /"Asha ""Ace"" Rao"/);
    assert.match(csv, /"Matched"/);
  });

  it("skips every row when a required LMS header is missing", async () => {
    const fileName = `${loanPrefix}-missing-header.csv`;
    const imported = await requestJson<ImportResult>(baseUrl, "/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName,
        headers: [
          "loanid",
          "disbursedon_date",
          "Client_UID",
          "Client_VID",
          "Client_PAN",
          "ClientName",
          "mobile_no",
          "alternate_mobile_no",
          "Gender",
          "date_of_birth",
        ],
        rows: [
          {
            loanid: `${loanPrefix}-missing-header`,
            ClientID: "",
            disbursedon_date: "01-01-2026",
            Client_UID: "",
            Client_VID: "",
            Client_PAN: "",
            ClientName: "Missing Client ID",
            mobile_no: "9876543210",
            alternate_mobile_no: "",
            Gender: "F",
            date_of_birth: "01-01-1990",
          },
        ],
      }),
    });

    assert.deepEqual(imported, {
      imported: 0,
      skipped: 1,
      duplicates: 0,
      fileName,
    });
  });

  it("rejects an import when the LMS header list is omitted", async () => {
    const response = await fetch(`${baseUrl}/clients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName: `${loanPrefix}-no-headers.csv`,
        rows: [
          {
            loanid: `${loanPrefix}-no-headers`,
            ClientID: `CLI-${runId}-no-headers`,
            disbursedon_date: "01-01-2026",
            Client_UID: "",
            Client_VID: "",
            Client_PAN: "",
            ClientName: "No Headers",
            mobile_no: "9876543210",
            alternate_mobile_no: "",
            Gender: "F",
            date_of_birth: "01-01-1990",
          },
        ],
      }),
    });

    assert.equal(response.status, 400);
  });

  it("requires optional-value columns to remain present in the LMS header", async () => {
    const allHeaders = [
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

    for (const omittedHeader of [
      "Client_UID",
      "Client_VID",
      "Client_PAN",
      "alternate_mobile_no",
    ]) {
      const fileName = `${loanPrefix}-missing-${omittedHeader}.csv`;
      const imported = await requestJson<ImportResult>(baseUrl, "/clients", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName,
          headers: allHeaders.filter((header) => header !== omittedHeader),
          rows: [
            {
              loanid: `${loanPrefix}-missing-${omittedHeader}`,
              ClientID: `CLI-${runId}-${omittedHeader}`,
              disbursedon_date: "01-01-2026",
              Client_UID: "",
              Client_VID: "",
              Client_PAN: "",
              ClientName: "Complete Required Values",
              mobile_no: "9876543210",
              alternate_mobile_no: "",
              Gender: "F",
              date_of_birth: "01-01-1990",
            },
          ],
        }),
      });

      assert.deepEqual(imported, {
        imported: 0,
        skipped: 1,
        duplicates: 0,
        fileName,
      });
    }
  });

  it("skips blank required values while importing valid rows from the same file", async () => {
    const fileName = `${loanPrefix}-mixed.csv`;
    const imported = await requestJson<ImportResult>(baseUrl, "/clients", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fileName,
        headers: LMS_HEADERS,
        rows: [
          {
            loanid: `${loanPrefix}-valid`,
            ClientID: `CLI-${runId}-valid`,
            disbursedon_date: "01-01-2026",
            Client_UID: "",
            Client_VID: "",
            Client_PAN: "",
            ClientName: "Valid Client",
            mobile_no: "9876543210",
            alternate_mobile_no: "",
            Gender: "F",
            date_of_birth: "01-01-1990",
          },
          {
            loanid: `${loanPrefix}-blank-name`,
            ClientID: `CLI-${runId}-blank-name`,
            disbursedon_date: "02-01-2026",
            Client_UID: "",
            Client_VID: "",
            Client_PAN: "",
            ClientName: "   ",
            mobile_no: "9876543211",
            alternate_mobile_no: "",
            Gender: "M",
            date_of_birth: "02-01-1990",
          },
          {
            loanid: `${loanPrefix}-blank-mobile`,
            ClientID: `CLI-${runId}-blank-mobile`,
            disbursedon_date: "03-01-2026",
            Client_UID: "",
            Client_VID: "",
            Client_PAN: "",
            ClientName: "Another Invalid Client",
            mobile_no: "",
            alternate_mobile_no: "",
            Gender: "F",
            date_of_birth: "03-01-1990",
          },
        ],
      }),
    });

    assert.deepEqual(imported, {
      imported: 1,
      skipped: 2,
      duplicates: 0,
      fileName,
    });

    const clientList = await requestJson<{ items: ClientRecord[]; total: number }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(`${loanPrefix}-valid`)}&pageSize=10`,
    );
    assert.equal(clientList.total, 1);
    assert.equal(clientList.items[0]?.ClientName, "Valid Client");
  });
});
