import { getServerUrl } from "./storage";

export interface Vendor {
  id: number;
  name: string;
}

export interface Filament {
  id: number;
  name: string;
  material: string;
  /** Local-only: canonical color name (normalized). Not from Spoolman API. */
  color_name?: string;
  /** Spoolman-sourced hex (no # prefix). */
  color_hex?: string;
  /** Local-only: user-set #RRGGBB from ColorNormalizer. Not from Spoolman API. */
  color_hex_normalized?: string;
  vendor?: Vendor;
  weight?: number;
  spool_weight?: number;
  comment?: string;
  /** Local-only: purchase price. Not from Spoolman API. */
  paid_price?: number;
  /** Local-only: shop/vendor name. Not from Spoolman API. */
  shop?: string;
}

export interface Spool {
  id: number;
  filament: Filament;
  remaining_weight?: number;
  initial_weight?: number;
  spool_weight?: number;
  used_weight?: number;
  comment?: string;
  archived?: boolean;
  lot_nr?: string;
  last_used?: string;
  first_used?: string;
  /** Internal bridge field: SQLite local_id. Not from Spoolman API. */
  _localId?: string;
  /** Internal bridge field: local filament_local_id. Not from Spoolman API. */
  _filamentLocalId?: string;
  /** Internal bridge field: local display_name. Not from Spoolman API. */
  _displayName?: string;
  /** Internal bridge field: local qr_code. Not from Spoolman API. */
  _qrCode?: string;
  /** Internal bridge field: local nfc_tag_id. Not from Spoolman API. */
  _nfcTagId?: string;
  /** Internal bridge field: local favorite state. Not from Spoolman API. */
  _isFavorite?: boolean;
  registered?: string;
}

export interface HealthResponse {
  status: string;
  version?: string;
}

export interface NetworkError {
  type:
    | "timeout"
    | "network"
    | "cleartext"
    | "http_error"
    | "parse_error"
    | "unknown";
  message: string;
  endpoint?: string;
  statusCode?: number;
}

const TIMEOUT_MS = 8000;

function normalizeUrl(raw: string): string {
  // Remove whitespace and invisible zero-width characters
  let url = raw.trim().replace(/[\u200B-\u200D\uFEFF\u00A0]/g, "");
  // Add http:// if no protocol
  if (!/^https?:\/\//i.test(url)) {
    url = "http://" + url;
  }
  // Remove trailing slash
  return url.replace(/\/+$/, "");
}

function debugLog(msg: string, data?: unknown) {
  if (__DEV__) {
    if (data !== undefined) {
      console.log(`[Spoolman] ${msg}`, data);
    } else {
      console.log(`[Spoolman] ${msg}`);
    }
  }
}

function classifyError(err: unknown, endpoint: string): NetworkError {
  if (err instanceof Error) {
    const name = err.name;
    const msg = err.message;

    if (name === "AbortError") {
      return {
        type: "timeout",
        message: `Request to ${endpoint} timed out after ${TIMEOUT_MS / 1000}s. Server may be offline or URL is wrong.`,
        endpoint,
      };
    }
    if (
      msg.includes("cleartext") ||
      msg.includes("CLEARTEXT") ||
      msg.includes("ERR_CLEARTEXT_NOT_PERMITTED")
    ) {
      return {
        type: "cleartext",
        message: `HTTP is blocked by Android. The server uses HTTP but Android is blocking cleartext. Try rebuilding with a custom dev client.`,
        endpoint,
      };
    }
    if (
      msg.includes("Network request failed") ||
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("ECONNRESET")
    ) {
      return {
        type: "network",
        message: `Network unreachable at ${endpoint}. Check WiFi/VPN and that the server is running.`,
        endpoint,
      };
    }
    return {
      type: "unknown",
      message: msg,
      endpoint,
    };
  }
  return {
    type: "unknown",
    message: String(err),
    endpoint,
  };
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    debugLog(`Aborting request (timeout ${TIMEOUT_MS}ms): ${url}`);
    controller.abort();
  }, TIMEOUT_MS);

  debugLog(`→ ${options.method ?? "GET"} ${url}`);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    debugLog(`← ${res.status} ${url}`);
    return res;
  } catch (err) {
    debugLog(`✗ fetch error for ${url}:`, err);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function getBaseUrl(): Promise<string> {
  const url = await getServerUrl();
  if (!url) throw new Error("Server URL not configured");
  return normalizeUrl(url);
}

export async function checkHealth(
  serverUrl?: string
): Promise<HealthResponse> {
  const rawBase = serverUrl ?? (await getServerUrl()) ?? "";
  const base = normalizeUrl(rawBase);
  const endpoint = `${base}/api/v1/health`;

  debugLog(`Health check → ${endpoint}`);

  if (!base) throw new Error("Server URL not configured");

  let res: Response;
  try {
    res = await fetchWithTimeout(endpoint);
  } catch (err) {
    const classified = classifyError(err, endpoint);
    debugLog(`Health check failed (${classified.type}):`, classified.message);
    const error = new Error(classified.message) as Error & {
      networkError: NetworkError;
    };
    error.networkError = classified;
    throw error;
  }

  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      // ignore
    }
    debugLog(`Health check HTTP error ${res.status}: ${body}`);
    const netErr: NetworkError = {
      type: "http_error",
      message: `Server returned ${res.status}. ${body ? body.slice(0, 100) : ""}`,
      endpoint,
      statusCode: res.status,
    };
    const error = new Error(netErr.message) as Error & {
      networkError: NetworkError;
    };
    error.networkError = netErr;
    throw error;
  }

  let data: HealthResponse;
  try {
    data = (await res.json()) as HealthResponse;
  } catch {
    const netErr: NetworkError = {
      type: "parse_error",
      message: "Server responded but did not return valid JSON.",
      endpoint,
    };
    const error = new Error(netErr.message) as Error & {
      networkError: NetworkError;
    };
    error.networkError = netErr;
    throw error;
  }

  debugLog(`Health check OK:`, data);
  return data;
}

export async function fetchSpools(): Promise<Spool[]> {
  const base = await getBaseUrl();
  const endpoint = `${base}/api/v1/spool?expand[]=filament`;
  let res: Response;
  try {
    res = await fetchWithTimeout(endpoint);
  } catch (err) {
    const classified = classifyError(err, endpoint);
    throw new Error(classified.message);
  }
  if (!res.ok) throw new Error(`Failed to fetch spools: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data as Spool[];
  return [];
}

export async function fetchSpool(id: number): Promise<Spool> {
  const base = await getBaseUrl();
  const endpoint = `${base}/api/v1/spool/${id}?expand[]=filament`;
  let res: Response;
  try {
    res = await fetchWithTimeout(endpoint);
  } catch (err) {
    const classified = classifyError(err, endpoint);
    throw new Error(classified.message);
  }
  if (!res.ok) throw new Error(`Failed to fetch spool ${id}: ${res.status}`);
  return (await res.json()) as Spool;
}

export async function updateSpoolWeight(
  id: number,
  remaining_weight: number
): Promise<Spool> {
  const base = await getBaseUrl();
  const endpoint = `${base}/api/v1/spool/${id}`;
  let res: Response;
  try {
    res = await fetchWithTimeout(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ remaining_weight }),
    });
  } catch (err) {
    const classified = classifyError(err, endpoint);
    throw new Error(classified.message);
  }
  if (!res.ok) throw new Error(`Failed to update spool ${id}: ${res.status}`);
  return (await res.json()) as Spool;
}

export function getFilamentColor(spool: Spool): string {
  const normalized = spool.filament?.color_hex_normalized;
  if (normalized) return normalized.startsWith("#") ? normalized : `#${normalized}`;
  const hex = spool.filament?.color_hex;
  if (!hex) return "#888888";
  return hex.startsWith("#") ? hex : `#${hex}`;
}

export function getRemainingPercent(spool: Spool): number {
  const remaining = spool.remaining_weight ?? spool.initial_weight ?? 0;
  const total = spool.initial_weight ?? spool.filament?.weight ?? 1000;
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, (remaining / total) * 100));
}

export function getDisplayName(spool: Spool): string {
  const filament = spool.filament;
  if (!filament) return `Spool #${spool.id}`;
  const parts: string[] = [];
  if (filament.vendor?.name) parts.push(filament.vendor.name);
  if (filament.name) parts.push(filament.name);
  if (parts.length === 0) return `Spool #${spool.id}`;
  return parts.join(" – ");
}
