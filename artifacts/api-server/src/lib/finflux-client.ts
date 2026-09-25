const FINFLUX_API_BASE_URL =
  "https://light.finflux.io/fineract-provider/api";
const FINFLUX_TENANT_ID = "light";
const CKYC_DOCUMENT_TYPE_ID = 2274;
const REQUEST_TIMEOUT_MS = 30_000;

export interface FinfluxCredentials {
  username: string;
  password: string;
}

export interface FinfluxUpdateRecord {
  clientId: string;
  ckycNumber: string;
}

export interface FinfluxIdentifierResult {
  success: boolean;
  statusCode: number | null;
  message: string;
}

export class FinfluxAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinfluxAuthenticationError";
  }
}

export class FinfluxUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinfluxUnavailableError";
  }
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function readJson(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

function getApiMessage(body: unknown, statusCode: number): string {
  const root = recordOf(body);
  const errors = Array.isArray(root?.errors) ? root.errors : [];
  const firstError = recordOf(errors[0]);
  const message =
    (typeof root?.defaultUserMessage === "string" &&
    root.defaultUserMessage.trim()
      ? root.defaultUserMessage
      : null) ??
    (typeof firstError?.defaultUserMessage === "string" &&
    firstError.defaultUserMessage.trim()
      ? firstError.defaultUserMessage
      : null);

  return (message ?? `Finflux rejected the update (HTTP ${statusCode}).`)
    .replace(/\s+/g, " ")
    .slice(0, 400);
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

export async function authenticateWithFinflux(
  credentials: FinfluxCredentials,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(`${FINFLUX_API_BASE_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "access-token-app",
        grant_type: "password",
        isPasswordEncrypted: "false",
        username: credentials.username,
        password: credentials.password,
      }),
      signal: timeoutSignal(),
    });
  } catch {
    throw new FinfluxUnavailableError(
      "Finflux authentication is unavailable. Try again shortly.",
    );
  }

  const body = recordOf(await readJson(response));
  const accessToken =
    typeof body?.access_token === "string" ? body.access_token : null;

  if (!response.ok || !accessToken) {
    if (response.status === 400 || response.status === 401) {
      throw new FinfluxAuthenticationError(
        "Finflux login failed. Check the username and password.",
      );
    }
    if (!response.ok && response.status >= 500) {
      throw new FinfluxUnavailableError(
        "Finflux authentication is unavailable. Try again shortly.",
      );
    }
    throw new FinfluxAuthenticationError(
      "Finflux did not accept the supplied login.",
    );
  }

  return accessToken;
}

export async function addFinfluxCkycIdentifier(
  accessToken: string,
  record: FinfluxUpdateRecord,
  fetchImpl: typeof fetch = fetch,
): Promise<FinfluxIdentifierResult> {
  let response: Response;
  try {
    response = await fetchImpl(
      `${FINFLUX_API_BASE_URL}/v1/clients/${encodeURIComponent(record.clientId)}/identifiers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "fineract-platform-tenantid": FINFLUX_TENANT_ID,
        },
        body: JSON.stringify({
          documentTypeId: CKYC_DOCUMENT_TYPE_ID,
          status: 200,
          documentKey: record.ckycNumber,
          locale: "en",
          dateFormat: "dd MMMM yyyy",
          unmask: "false",
        }),
        signal: timeoutSignal(),
      },
    );
  } catch (error) {
    return {
      success: false,
      statusCode: null,
      message:
        error instanceof Error && error.name === "TimeoutError"
          ? "Finflux request timed out."
          : "Could not reach Finflux for this client.",
    };
  }

  const body = await readJson(response);
  if (response.status === 200 || response.status === 201) {
    return {
      success: true,
      statusCode: response.status,
      message: "CKYC identifier added successfully.",
    };
  }

  return {
    success: false,
    statusCode: response.status,
    message: getApiMessage(body, response.status),
  };
}