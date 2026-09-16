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
  ckycResponseMatchedBy: string | null;
  ckycResponseRequestLine: string | null;
  ckycResponseMatchedRow: string | null;
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
  const batchDownloadRequestIds: number[] = [];
  const downloadResponseRecordIds: number[] = [];
  const runId = `${Date.now()}-${process.pid}`;
  const loanPrefix = `workflow-regression-${runId}`;
  const downloadReference = `IN${String(process.pid).padStart(12, "0")}`;
  const fullResponseId = `O${downloadReference}`;

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
    if (batchDownloadRequestIds.length) {
      await pool.query(
        "DELETE FROM ckyc_download_requests WHERE id = ANY($1::int[])",
        [batchDownloadRequestIds],
      );
    }
    if (downloadResponseRecordIds.length) {
      await pool.query(
        "DELETE FROM ckyc_download_response_records WHERE id = ANY($1::int[])",
        [downloadResponseRecordIds],
      );
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
            dateOfBirth: "1990-04-02",
            gender: "F",
            searchType: "E",
            searchValue: "9012",
            sequence: 1,
          },
          {
            clientId: asha.id,
            name: asha.ClientName,
            dateOfBirth: "1990-04-02",
            gender: "F",
            searchType: "B",
            searchValue: `VID-${runId}-1`,
            sequence: 2,
          },
          {
            clientId: asha.id,
            name: asha.ClientName,
            dateOfBirth: "1990-04-02",
            gender: "F",
            searchType: "B",
            searchValue: "ABCDE1234F",
            sequence: 3,
          },
          {
            clientId: bharat.id,
            name: "Bharat Kumar",
            dateOfBirth: "1988-08-15",
            gender: "M",
            searchType: "E",
            searchValue: "1098",
            sequence: 4,
          },
          {
            clientId: bharat.id,
            name: "Bharat Kumar",
            dateOfBirth: "1988-08-15",
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
       `20|1|E|9012|${fullResponseId}|ASHA RAO|04|03|04|04|04|04|XXXXXXXXXX3210|04|||`,
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
    assert.equal(updatedAsha?.ckycResponseId, fullResponseId);
    assert.equal(updatedAsha?.ckycResponseError, null);
    assert.equal(updatedAsha?.ckycResponseMatchedBy, "Matched by UID");
    assert.equal(
      updatedAsha?.ckycResponseRequestLine,
      "20|1|E|9012|Asha Rao|02-04-1990|F|",
    );
    assert.equal(
      updatedAsha?.ckycResponseMatchedRow,
      `20|1|E|9012|${fullResponseId}|ASHA RAO|04|03|04|04|04|04|XXXXXXXXXX3210|04|||`,
    );
    assert.equal(updatedBharat?.ckycResponseStatus, "error");
    assert.equal(updatedBharat?.ckycResponseId, null);
    assert.equal(updatedBharat?.ckycResponseMatchedBy, "Matched by UID");
    assert.equal(
      updatedBharat?.ckycResponseRequestLine,
      "20|4|E|1098|Bharat Kumar|15-08-1988|M|",
    );
    assert.equal(
      updatedBharat?.ckycResponseMatchedRow,
      "20|4|E|1098|||||||||KYC Number does not exist for this identity type and number||||",
    );
    assert.match(
      updatedBharat?.ckycResponseError ?? "",
      /KYC Number does not exist/,
    );
    assert.ok(noIdentifier);

    await requestJson<CkycFile>(
      baseUrl,
      `/ckyc/requests/${generated.id}/response`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: `${loanPrefix}-source-check.txt`,
          content: [
            "10|IN2884|1|2|V1.1|02-09-2026||||",
            `20|2|B|VID-${runId}-1|${fullResponseId}|ASHA RAO|04|03|04|04|04|04|XXXXXXXXXX3210|04|||`,
            `20|5|B|PQRSX5678K|${fullResponseId}|BHARAT KUMAR|04|03|04|04|04|04|XXXXXXXXXX3211|04|||`,
          ].join("\r\n"),
        }),
      },
    );
    const sourceCheckedClients = await requestJson<{
      items: ClientRecord[];
      total: number;
    }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&pageSize=10`,
    );
    const sourceCheckedAsha = sourceCheckedClients.items.find((client) =>
      client.loanid.endsWith("-1"),
    );
    const sourceCheckedBharat = sourceCheckedClients.items.find((client) =>
      client.loanid.endsWith("-2"),
    );
    assert.equal(sourceCheckedAsha?.ckycResponseMatchedBy, "Match by VID");
    assert.equal(
      sourceCheckedAsha?.ckycResponseRequestLine,
      `20|2|B|VID-${runId}-1||||`,
    );
    assert.equal(
      sourceCheckedAsha?.ckycResponseMatchedRow,
      `20|2|B|VID-${runId}-1|${fullResponseId}|ASHA RAO|04|03|04|04|04|04|XXXXXXXXXX3210|04|||`,
    );
    assert.equal(sourceCheckedBharat?.ckycResponseMatchedBy, "Matched by PAN");
    assert.equal(
      sourceCheckedBharat?.ckycResponseRequestLine,
      "20|5|B|PQRSX5678K||||",
    );
    assert.equal(
      sourceCheckedBharat?.ckycResponseMatchedRow,
      `20|5|B|PQRSX5678K|${fullResponseId}|BHARAT KUMAR|04|03|04|04|04|04|XXXXXXXXXX3211|04|||`,
    );

    await pool.query(
      "UPDATE clients SET ckyc_response_id = $1, ckyc_response_status = 'matched', ckyc_response_error = NULL WHERE id = $2",
      [fullResponseId, bharat.id],
    );
    await pool.query("UPDATE clients SET date_of_birth = $1 WHERE id = $2", [
      "1988-08-15",
      bharat.id,
    ]);
    await pool.query(
      "UPDATE clients SET ckyc_response_id = $1, ckyc_response_status = 'matched', ckyc_number = $2 WHERE id = $3",
      ["PREFIXINWITHKYCNUMBER", "30064364932165", noIdentifier.id],
    );

    const batchedDownload = await requestJson<{
      requests: Array<{
        id: number;
        requestNumber: number;
        fileName: string;
        recordCount: number;
        content: string;
      }>;
      totalRecordCount: number;
      matchedClientCount: number;
      unmatchedReferences: string[];
    }>(baseUrl, "/ckyc/download-requests/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        clientReferences: [asha.loanid, bharat.loanid],
        maxRows: 1,
        sourceFileName: "selected-clients.csv",
        fileDate: "26022026",
        institutionCode: "IN2884",
        version: "V1.3",
        iraCode: "IRA010815",
      }),
    });
    batchDownloadRequestIds.push(
      ...batchedDownload.requests.map((request) => request.id),
    );
    assert.equal(batchedDownload.totalRecordCount, 2);
    assert.equal(batchedDownload.matchedClientCount, 2);
    assert.deepEqual(batchedDownload.unmatchedReferences, []);
    assert.equal(batchedDownload.requests.length, 2);
    assert.deepEqual(
      batchedDownload.requests.map((request) => request.recordCount),
      [1, 1],
    );
    assert.equal(
      batchedDownload.requests[0]?.fileName,
      `IN2884_1_26022026_V1.3_IRA010815_D${batchedDownload.requests[0]?.requestNumber}.txt`,
    );
    assert.match(
      batchedDownload.requests[0]?.content ?? "",
      /\r\n60\|/,
    );
    assert.match(
      batchedDownload.requests[1]?.content ?? "",
      /\r\n60\|[^|]+\|15-08-1988\|1\|\|/,
    );

    const pendingRequestNumber =
      Math.max(
        ...batchedDownload.requests.map((request) => request.requestNumber),
      ) + 1;
    const pendingResponse = await requestJson<{
      storedRecordId: number;
      requestNumber: number | null;
      storedRecordCount: number;
      requestMatched: boolean;
      updatedCount: number;
    }>(baseUrl, "/ckyc/download-requests/response", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        sourceFileName: `Pasted-10-${pendingRequestNumber}-final.txt`,
        fileContentBase64: Buffer.from(
          `10|${pendingRequestNumber}|IN2884|1|1|10-09-2026|V1.3|||||\r\n20|1|E|REFERENCE||||\r\n`,
        ).toString("base64"),
      }),
    });
    downloadResponseRecordIds.push(pendingResponse.storedRecordId);
    assert.equal(pendingResponse.requestNumber, pendingRequestNumber);
    assert.equal(pendingResponse.storedRecordCount, 1);
    assert.equal(pendingResponse.requestMatched, false);
    assert.equal(pendingResponse.updatedCount, 0);

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
      responseFileName: string | null;
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
      downloaded.responseFileName,
      `Pasted-10-${pendingRequestNumber}-final.txt`,
    );
    assert.equal(
      downloaded.content,
       `10|${downloaded.requestNumber}|IN2884|1|1BR|1|||||\r\n60|${downloadReference}|02-04-1990|1||\r\n`,
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
      "O50009293913726",
      downloadReference,
    ]);
    const fileContentBase64 = Buffer.from(
      await workbook.xlsx.writeBuffer(),
    ).toString("base64");
    const responseImported = await requestJson<{
      sourceFileName: string;
      storedRecordId: number;
      requestNumber: number | null;
      storedRecordCount: number;
      requestMatched: boolean;
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
    downloadResponseRecordIds.push(responseImported.storedRecordId);
    assert.equal(responseImported.sourceFileName, "portal-download-response.xlsx");
    assert.equal(responseImported.requestNumber, null);
    assert.equal(responseImported.storedRecordCount, 1);
    assert.equal(responseImported.requestMatched, false);
    assert.equal(responseImported.updatedCount, 2);
    assert.equal(responseImported.skippedCount, 0);
    assert.deepEqual(responseImported.missingReferences, []);

    const finalClients = await requestJson<{
      items: ClientRecord[];
      total: number;
    }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(`${loanPrefix}-1`)}&pageSize=10`,
    );
    assert.equal(finalClients.items[0]?.ckycNumber, "O50009293913726");
    const duplicateClients = await requestJson<{
      items: ClientRecord[];
      total: number;
    }>(
      baseUrl,
      `/clients?search=${encodeURIComponent(loanPrefix)}&pageSize=10`,
    );
    assert.equal(
      duplicateClients.items.find((client) => client.loanid.endsWith("-2"))
        ?.ckycNumber,
      "O50009293913726",
    );
  });

  it("escapes CKYC result reports for CSV and spreadsheet safety", () => {
    const csv = createClientsCsv([
      {
        clientId: "=danger",
        loanid: "loan,1",
        clientName: 'Asha "Ace" Rao',
         clientUid: "123456789012",
         clientVid: "VID-123",
         clientPan: "ABCDE1234F",
        gender: "F",
        disbursedOnDate: "2026-01-02",
        ckycResponseId: "IN123",
        ckycNumber: "60046100000000",
        ckycResponseStatus: "matched",
        ckycResponseError: null,
        ckycResponseMatchedBy: "Matched by UID",
        ckycResponseRequestLine: "20|1|E|1234|Asha|02-01-2026|F|",
        ckycResponseMatchedRow:
          "20|1|E|1234|IN123|ASHA|04|03|04|04|04|04|XXXXXXXXXX3210|04|||",
      },
    ]);

    assert.match(csv, /"'=danger"/);
    assert.match(csv, /"loan,1"/);
    assert.match(csv, /"Asha ""Ace"" Rao"/);
    assert.match(csv, /"F"/);
    assert.match(csv, /"'123456789012"/);
    assert.match(csv, /"VID-123"/);
    assert.match(csv, /"ABCDE1234F"/);
    assert.match(csv, /"02-01-2026"/);
    assert.match(csv, /"'60046100000000"/);
    assert.match(csv, /"Matched"/);
    assert.match(csv, /"Matched by UID"/);
    assert.match(csv, /"Match"/);
    assert.match(csv, /"20\|1\|E\|1234\|Asha\|02-01-2026\|F\|"/);
    assert.match(
      csv,
      /"20\|1\|E\|1234\|IN123\|ASHA\|04\|03\|04\|04\|04\|04\|XXXXXXXXXX3210\|04\|\|\|"/,
    );
  });

  it("derives report match status from the CKYC response customer name", () => {
    const csv = createClientsCsv([
      {
        clientId: "1",
        loanid: "loan-1",
        clientName: "Asha Rao",
        clientUid: "1111",
        clientVid: "VID-1",
        clientPan: "PAN-1",
        gender: "F",
        disbursedOnDate: "2026-01-02",
        ckycResponseId: "ID-1",
        ckycNumber: null,
        ckycResponseStatus: "matched",
        ckycResponseError: null,
        ckycResponseMatchedBy: "Match by VID",
        ckycResponseRequestLine: null,
        ckycResponseMatchedRow: "20|1|B|VID-1|ID-1|ASHA RAO||||",
      },
      {
        clientId: "2",
        loanid: "loan-2",
        clientName: "Bharat Kumar",
        clientUid: "2222",
        clientVid: "VID-2",
        clientPan: "PAN-2",
        gender: "M",
        disbursedOnDate: "2026-01-02",
        ckycResponseId: "ID-2",
        ckycNumber: null,
        ckycResponseStatus: "matched",
        ckycResponseError: null,
        ckycResponseMatchedBy: "Matched by PAN",
        ckycResponseRequestLine: null,
        ckycResponseMatchedRow: "20|2|B|PAN-2|ID-2|BHARAT||||",
      },
      {
        clientId: "3",
        loanid: "loan-3",
        clientName: "Chetan Shah",
        clientUid: "3333",
        clientVid: "VID-3",
        clientPan: "PAN-3",
        gender: "M",
        disbursedOnDate: "2026-01-02",
        ckycResponseId: "ID-3",
        ckycNumber: null,
        ckycResponseStatus: "matched",
        ckycResponseError: null,
        ckycResponseMatchedBy: "Matched by UID",
        ckycResponseRequestLine: null,
        ckycResponseMatchedRow: "20|3|E|3333|ID-3|RAMESH PATEL||||",
      },
    ]);

    assert.match(csv, /"Properly Match"/);
    assert.match(csv, /"Match"/);
    assert.match(csv, /"Not Match"/);
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
