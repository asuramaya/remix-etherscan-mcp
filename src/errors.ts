export const ErrorCode = {
  ETHERSCAN_API_ERROR: "ETHERSCAN_API_ERROR",
  REMIXD_NOT_RUNNING:  "REMIXD_NOT_RUNNING",
  FILE_NOT_FOUND:      "FILE_NOT_FOUND",
  COMPILE_ERROR:       "COMPILE_ERROR",
  NOT_VERIFIED:        "NOT_VERIFIED",
  RATE_LIMITED:        "RATE_LIMITED",
  NETWORK_ERROR:       "NETWORK_ERROR",
  INVALID_PARAMS:      "INVALID_PARAMS",
  PATH_TRAVERSAL:      "PATH_TRAVERSAL",
  READ_ONLY_MODE:      "READ_ONLY_MODE",
} as const;

export type ErrorCodeKey = keyof typeof ErrorCode;

export interface McpErrorEnvelope {
  error: true;
  code: ErrorCodeKey;
  message: string;
  details?: unknown;
}

export function mcpError(
  code: ErrorCodeKey,
  err: unknown,
  details?: unknown
): McpErrorEnvelope {
  return {
    error:   true,
    code,
    message: err instanceof Error ? err.message : String(err),
    details,
  };
}

export function ok<T>(data: T): T {
  return data;
}

// Retries an async function up to maxAttempts with exponential backoff.
// Surfaces RATE_LIMITED after exhausting attempts.
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 500
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("429") && !msg.includes("rate limit") && !msg.toLowerCase().includes("max rate")) {
        throw err; // not a rate limit error — propagate immediately
      }
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, baseDelayMs * 2 ** attempt));
      }
    }
  }
  throw Object.assign(new Error("Rate limited after retries"), { code: ErrorCode.RATE_LIMITED, cause: lastError });
}
