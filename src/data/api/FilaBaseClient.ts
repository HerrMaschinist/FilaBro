/**
 * FilaBase HTTP API Client (former Spoolman integration).
 *
 * Pure network layer — no DB imports, no state management.
 * All functions are stateless and receive baseUrl as a parameter.
 */
import type {
  RemoteHealth,
  RemoteSpool,
  RemoteFilament,
  RemoteVendor,
  SpoolPatchPayload,
} from "./types";

const TIMEOUT_MS = 8000;

export type NetworkErrorType =
  | "timeout"
  | "network"
  | "cleartext"
  | "http_error"
  | "parse_error"
  | "unknown";

export interface FilaBaseNetworkError extends Error {
  errorType: NetworkErrorType;
  endpoint: string;
  statusCode?: number;
  responseBody?: string;
}

function makeNetworkError(
  type: NetworkErrorType,
  message: string,
  endpoint: string,
  statusCode?: number,
  responseBody?: string
): FilaBaseNetworkError {
  const err = new Error(message) as FilaBaseNetworkError;
  err.errorType = type;
  err.endpoint = endpoint;
  if (statusCode !== undefined) err.statusCode = statusCode;
  if (responseBody !== undefined) err.responseBody = responseBody;
  return err;
}

function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
  if (!/^https?:\/\//i.test(url)) url = "http://" + url;
  return url.replace(/\/+$/, "");
}

function classifyFetchError(
  err: unknown,
  endpoint: string
): FilaBaseNetworkError {
  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return makeNetworkError(
        "timeout",
        `Timeout after ${TIMEOUT_MS / 1000}s — is ${endpoint} reachable?`,
        endpoint
      );
    }
    const m = err.message;
    if (
      m.includes("cleartext") ||
      m.includes("CLEARTEXT") ||
      m.includes("ERR_CLEARTEXT_NOT_PERMITTED")
    ) {
      return makeNetworkError(
        "cleartext",
        "Android is blocking HTTP. Enable usesCleartextTraffic or use a custom dev client.",
        endpoint
      );
    }
    if (
      m.includes("Network request failed") ||
      m.includes("Failed to fetch") ||
      m.includes("ECONNREFUSED") ||
      m.includes("ENOTFOUND") ||
      m.includes("ECONNRESET") ||
      m.includes("NetworkError")
    ) {
      return makeNetworkError(
        "network",
        `Network unreachable: ${m}`,
        endpoint
      );
    }
    return makeNetworkError("unknown", m, endpoint);
  }
  return makeNetworkError("unknown", String(err), endpoint);
}

async function request<T>(
  baseUrl: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const endpoint = `${normalizeBaseUrl(baseUrl)}${path}`;
  const controller = new AbortController();

  const timer = setTimeout(() => {
    if (__DEV__) console.log(`[FilaBaseClient] ⏱ Abort timeout: ${endpoint}`);
    controller.abort();
  }, TIMEOUT_MS);

  if (__DEV__) {
    console.log(`[FilaBaseClient] → ${options.method ?? "GET"} ${endpoint}`);
  }

  let res: Response;
  try {
    res = await fetch(endpoint, { ...options, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    const classified = classifyFetchError(err, endpoint);
    if (__DEV__) {
      console.log(
        `[FilaBaseClient] ✗ ${classified.errorType}: ${classified.message}`
      );
    }
    throw classified;
  }

  clearTimeout(timer);

  if (__DEV__) {
    console.log(`[FilaBaseClient] ← ${res.status} ${endpoint}`);
  }

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    if (__DEV__) {
      console.log(
        `[FilaBaseClient] ✗ HTTP ${res.status} ${endpoint}: ${body.slice(0, 200)}`
      );
    }
    throw makeNetworkError(
      "http_error",
      `HTTP ${res.status}: ${body.slice(0, 120)}`,
      endpoint,
      res.status,
      body
    );
  }

  try {
    const data = (await res.json()) as T;
    return data;
  } catch {
    throw makeNetworkError(
      "parse_error",
      "Server responded but returned invalid JSON.",
      endpoint
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function healthCheck(baseUrl: string): Promise<RemoteHealth> {
  return request<RemoteHealth>(baseUrl, "/api/v1/health");
}

export async function getSpools(baseUrl: string): Promise<RemoteSpool[]> {
  const data = await request<RemoteSpool[]>(
    baseUrl,
    "/api/v1/spool?expand[]=filament"
  );
  return Array.isArray(data) ? data : [];
}

export async function getSpool(
  baseUrl: string,
  id: number
): Promise<RemoteSpool> {
  return request<RemoteSpool>(
    baseUrl,
    `/api/v1/spool/${id}?expand[]=filament`
  );
}

export async function patchSpool(
  baseUrl: string,
  id: number,
  payload: SpoolPatchPayload
): Promise<RemoteSpool> {
  return request<RemoteSpool>(baseUrl, `/api/v1/spool/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getFilaments(
  baseUrl: string
): Promise<RemoteFilament[]> {
  const data = await request<RemoteFilament[]>(baseUrl, "/api/v1/filament");
  return Array.isArray(data) ? data : [];
}

export async function getVendors(baseUrl: string): Promise<RemoteVendor[]> {
  const data = await request<RemoteVendor[]>(baseUrl, "/api/v1/vendor");
  return Array.isArray(data) ? data : [];
}
