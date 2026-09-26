import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import app from "./app";
import {
  ckycRequestsTable,
  clientsTable,
  db,
  pool,
} from "@workspace/db";

type RestorePayload = {
  fileName: string;
  content: string;
};

type TestClient = {
  id: number;
  responseId: string;
  vid: string;
};

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("CKYC response source row restoration", () => {
  let server: Server;
  let baseUrl: string;
  const runId = `${Date.now()}-${process.pid}`;
  const clientIds: number[] = [];
  const requestIds: number[] = [];
  const clientPrefix = `response-restore-${runId}`;

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
    if (server) await closeServer(server);
    if (clientIds.length) {
      await pool.query(
        "DELETE FROM audit_trail WHERE metadata->>'clientId' = ANY($1::text[])",
        [clientIds.map(String)],
      );
    }
    if (requestIds.length) {
      await pool.query("DELETE FROM ckyc_requests WHERE id = ANY($1::int[])", [
        requestIds,
      ]);
    }
    if (clientIds.length) {
      await pool.query("DELETE FROM clients WHERE id = ANY($1::int[])", [
        clientIds,
      ]);
    }
  });

  async function createClient(suffix: string): Promise<TestClient> {
    const responseId = `RESPONSE-${clientPrefix}-${suffix}`;
    const vid = `VID-${clientPrefix}-${suffix}`;
    const [client] = await db
      .insert(clientsTable)
      .values({
        loanid: `${clientPrefix}-${suffix}`,
        clientId: `${clientPrefix}-${suffix}`,
        disbursedOnDate: "2026-09-01",
        clientUid: "",
        clientVid: vid,
        clientPan: "",
        clientName: "Asha Rao",
        mobileNo: "",
        alternateMobileNo: "",
        gender: "F",
        dateOfBirth: "01-01-1990",
        ckycResponseId: responseId,
        ckycResponseStatus: "matched",
        ckycResponseFileName: `original-${suffix}.txt`,
      })
      .returning({ id: clientsTable.id });
    assert.ok(client);
    clientIds.push(client.id);
    return { ...client, responseId, vid };
  }

  async function createRequest(
    client: TestClient,
    suffix: string,
    mappedClientId = client.id,
  ): Promise<number> {
    const requestLine = `20|1|B|${client.vid}||||`;
    const [request] = await db
      .insert(ckycRequestsTable)
      .values({
        fileName: `${clientPrefix}-${suffix}-request.txt`,
        content: `10|CKYC|1|1|V1.1|26-09-2026||||\r\n${requestLine}\r\n`,
        recordCount: 1,
        status: "generated",
        clientMapping: JSON.stringify([
          { sequence: 1, clientId: mappedClientId },
        ]),
      })
      .returning({ id: ckycRequestsTable.id });
    assert.ok(request);
    requestIds.push(request.id);
    return request.id;
  }

  function responseFile(client: TestClient, responseIds = [client.responseId]) {
    const responseLines = responseIds.map(
      (responseId) =>
        `20|1|B|${client.vid}|${responseId}|Asha Rao||||`,
    );
    return `10|CKYC|1|${responseLines.length}|V1.1|26-09-2026||||\r\n${responseLines.join("\r\n")}\r\n`;
  }

  async function restore(
    client: TestClient,
    content: string,
    fileName = `original-${clientPrefix}.txt`,
  ) {
    return fetch(`${baseUrl}/clients/${client.id}/ckyc-response/restore`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fileName, content } satisfies RestorePayload),
    });
  }

  async function readClient(clientId: number) {
    const [client] = await db
      .select()
      .from(clientsTable)
      .where(eq(clientsTable.id, clientId));
    assert.ok(client);
    return client;
  }

  it("restores exact source rows and persists a client-specific audit entry", async () => {
    const client = await createClient("unique");
    const requestId = await createRequest(client, "unique");

    const response = await restore(client, responseFile(client));
    assert.equal(response.status, 200);
    const result = (await response.json()) as {
      requestLine: string;
      responseLine: string;
      requestId: number;
      auditEntry: { actorRole: string; fileName: string };
    };
    assert.equal(result.requestLine, `20|1|B|${client.vid}||||`);
    assert.equal(
      result.responseLine,
      `20|1|B|${client.vid}|${client.responseId}|Asha Rao||||`,
    );
    assert.equal(result.requestId, requestId);
    assert.equal(result.auditEntry.actorRole, "manager");

    const updated = await readClient(client.id);
    assert.equal(updated.ckycResponseId, client.responseId);
    assert.equal(updated.ckycResponseRequestId, requestId);
    assert.equal(updated.ckycResponseRequestLine, result.requestLine);
    assert.equal(updated.ckycResponseMatchedRow, result.responseLine);

    const auditResponse = await fetch(
      `${baseUrl}/clients/${client.id}/ckyc-response/restoration-audit`,
    );
    assert.equal(auditResponse.status, 200);
    const audit = (await auditResponse.json()) as {
      auditEntry: { actorRole: string; fileName: string } | null;
    };
    assert.equal(audit.auditEntry?.actorRole, "manager");
    assert.equal(audit.auditEntry?.fileName, `original-${clientPrefix}.txt`);
  });

  it("rejects a missing response ID match without changing the client", async () => {
    const client = await createClient("missing-response");
    await createRequest(client, "missing-response");

    const response = await restore(
      client,
      responseFile(client, [`OTHER-${client.responseId}`]),
    );
    assert.equal(response.status, 409);
    const unchanged = await readClient(client.id);
    assert.equal(unchanged.ckycResponseId, client.responseId);
    assert.equal(unchanged.ckycResponseRequestId, null);
    assert.equal(unchanged.ckycResponseRequestLine, null);
    assert.equal(unchanged.ckycResponseMatchedRow, null);
  });

  it("rejects duplicate response ID rows without changing the client", async () => {
    const client = await createClient("duplicate-response");
    await createRequest(client, "duplicate-response");

    const response = await restore(
      client,
      responseFile(client, [client.responseId, client.responseId]),
    );
    assert.equal(response.status, 409);
    const unchanged = await readClient(client.id);
    assert.equal(unchanged.ckycResponseRequestId, null);
    assert.equal(unchanged.ckycResponseRequestLine, null);
    assert.equal(unchanged.ckycResponseMatchedRow, null);
  });

  it("rejects ambiguous request associations without changing the client", async () => {
    const client = await createClient("ambiguous-request");
    await createRequest(client, "ambiguous-request-one");
    await createRequest(client, "ambiguous-request-two");

    const response = await restore(client, responseFile(client));
    assert.equal(response.status, 409);
    const unchanged = await readClient(client.id);
    assert.equal(unchanged.ckycResponseRequestId, null);
    assert.equal(unchanged.ckycResponseRequestLine, null);
    assert.equal(unchanged.ckycResponseMatchedRow, null);
  });

  it("rejects a request mapping that points to another client", async () => {
    const client = await createClient("conflicting-request");
    const otherClient = await createClient("conflicting-request-other");
    const requestId = await createRequest(
      client,
      "conflicting-request",
      otherClient.id,
    );
    await db
      .update(clientsTable)
      .set({ ckycResponseRequestId: requestId })
      .where(eq(clientsTable.id, client.id));

    const response = await restore(client, responseFile(client));
    assert.equal(response.status, 409);
    const unchanged = await readClient(client.id);
    assert.equal(unchanged.ckycResponseRequestId, requestId);
    assert.equal(unchanged.ckycResponseRequestLine, null);
    assert.equal(unchanged.ckycResponseMatchedRow, null);
  });

  it("rejects an uploaded row whose sequence is duplicated", async () => {
    const client = await createClient("duplicate-sequence");
    await createRequest(client, "duplicate-sequence");
    const responseContent = responseFile(client).replace(
      "\r\n",
      `\r\n20|1|B|${client.vid}|OTHER-${client.responseId}|Asha Rao||||\r\n`,
    );

    const response = await restore(client, responseContent);
    assert.equal(response.status, 409);
    const unchanged = await readClient(client.id);
    assert.equal(unchanged.ckycResponseRequestId, null);
    assert.equal(unchanged.ckycResponseRequestLine, null);
    assert.equal(unchanged.ckycResponseMatchedRow, null);
  });

  it("rejects source rows that conflict with the uploaded original", async () => {
    const client = await createClient("conflicting-source");
    await createRequest(client, "conflicting-source");
    await db
      .update(clientsTable)
      .set({ ckycResponseRequestLine: "20|1|B|CONFLICT||||" })
      .where(eq(clientsTable.id, client.id));

    const response = await restore(client, responseFile(client));
    assert.equal(response.status, 409);
    const unchanged = await readClient(client.id);
    assert.equal(unchanged.ckycResponseRequestLine, "20|1|B|CONFLICT||||");
    assert.equal(unchanged.ckycResponseMatchedRow, null);
  });
});