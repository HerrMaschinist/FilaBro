export type NetworkErrorType =
  | "timeout"
  | "network"
  | "cleartext"
  | "http_error"
  | "parse_error"
  | "unknown";

export class NetworkError extends Error {
  readonly errorType: NetworkErrorType;
  readonly endpoint: string;
  readonly statusCode?: number;

  constructor(
    type: NetworkErrorType,
    message: string,
    endpoint: string,
    statusCode?: number
  ) {
    super(message);
    this.name = "NetworkError";
    this.errorType = type;
    this.endpoint = endpoint;
    this.statusCode = statusCode;
  }
}

export class TimeoutError extends NetworkError {
  constructor(endpoint: string, timeoutMs: number) {
    super(
      "timeout",
      `Request to ${endpoint} timed out after ${timeoutMs / 1000}s. Server may be offline or URL is wrong.`,
      endpoint
    );
    this.name = "TimeoutError";
  }
}

export class ApiError extends NetworkError {
  readonly responseBody?: string;

  constructor(endpoint: string, statusCode: number, body?: string) {
    super(
      "http_error",
      `Server returned ${statusCode}${body ? `. ${body.slice(0, 200)}` : ""}`,
      endpoint,
      statusCode
    );
    this.name = "ApiError";
    this.responseBody = body;
  }
}

export class ParseError extends NetworkError {
  constructor(endpoint: string, detail?: string) {
    super(
      "parse_error",
      detail ?? "Server responded but did not return valid JSON.",
      endpoint
    );
    this.name = "ParseError";
  }
}

export class UnsupportedFeatureError extends Error {
  readonly feature: string;
  readonly reason: string;

  constructor(feature: string, reason: string) {
    super(`${feature} is not supported: ${reason}`);
    this.name = "UnsupportedFeatureError";
    this.feature = feature;
    this.reason = reason;
  }
}

export function classifyFetchError(
  err: unknown,
  endpoint: string
): NetworkError {
  if (err instanceof NetworkError) return err;

  if (err instanceof Error) {
    if (err.name === "AbortError") {
      return new TimeoutError(endpoint, 8000);
    }
    const msg = err.message;
    if (
      msg.includes("cleartext") ||
      msg.includes("CLEARTEXT") ||
      msg.includes("ERR_CLEARTEXT_NOT_PERMITTED")
    ) {
      return new NetworkError(
        "cleartext",
        "HTTP is blocked by Android. Try HTTPS or allow cleartext traffic.",
        endpoint
      );
    }
    if (
      msg.includes("Network request failed") ||
      msg.includes("Failed to fetch") ||
      msg.includes("NetworkError") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("ENOTFOUND") ||
      msg.includes("ECONNRESET") ||
      msg.includes("EHOSTUNREACH") ||
      msg.includes("ENETUNREACH")
    ) {
      return new NetworkError(
        "network",
        `Network unreachable at ${endpoint}. Check WiFi/VPN and that the server is running.`,
        endpoint
      );
    }
    return new NetworkError("unknown", msg, endpoint);
  }
  return new NetworkError("unknown", String(err), endpoint);
}
