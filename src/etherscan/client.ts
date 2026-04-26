import { ETHERSCAN_V2_BASE } from "./chains.js";
import { withRetry, ErrorCode } from "../errors.js";
import type { Config } from "../config.js";

export interface EtherscanResponse<T = unknown> {
  status:  string;
  message: string;
  result:  T;
}

export class EtherscanClient {
  private readonly apiKey: string;
  private readonly defaultChainId: number;

  constructor(config: Config) {
    this.apiKey        = config.etherscanApiKey;
    this.defaultChainId = config.defaultChainId;
  }

  async get<T = unknown>(
    module:  string,
    action:  string,
    params:  Record<string, string | number | boolean | undefined> = {},
    chainId?: number
  ): Promise<T> {
    const cid = chainId ?? this.defaultChainId;

    const query = new URLSearchParams();
    query.set("chainid", String(cid));
    query.set("module",  module);
    query.set("action",  action);
    query.set("apikey",  this.apiKey);

    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) query.set(k, String(v));
    }

    const url = `${ETHERSCAN_V2_BASE}?${query.toString()}`;

    return withRetry(async () => {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429) throw new Error("429 rate limit");
        throw Object.assign(new Error(`HTTP ${res.status}`), { code: ErrorCode.NETWORK_ERROR });
      }

      const body = await res.json() as EtherscanResponse<T> & { error?: { code?: number; message?: string; data?: unknown }; jsonrpc?: string };

      // JSON-RPC proxy endpoints use {jsonrpc, error} instead of {status, result}
      if (body.error) {
        const msg = body.error.message ?? "JSON-RPC error";
        if (msg.toLowerCase().includes("rate limit")) throw new Error("429 rate limit");
        throw Object.assign(new Error(msg), { code: ErrorCode.ETHERSCAN_API_ERROR, data: body.error.data });
      }

      if (body.status === "0") {
        const msg = String(body.result ?? body.message);
        if (msg.toLowerCase().includes("rate limit") || msg.includes("Max rate")) {
          throw new Error("429 rate limit");
        }
        throw Object.assign(new Error(msg), { code: ErrorCode.ETHERSCAN_API_ERROR });
      }

      return body.result;
    });
  }

  // POST for contract verification submissions
  async post<T = unknown>(
    module:  string,
    action:  string,
    body:    Record<string, string | number | boolean>,
    chainId?: number
  ): Promise<T> {
    const cid = chainId ?? this.defaultChainId;

    const query = new URLSearchParams({
      chainid: String(cid),
      module,
      action,
      apikey: this.apiKey,
    });

    return withRetry(async () => {
      const res = await fetch(`${ETHERSCAN_V2_BASE}?${query.toString()}`, {
        method:  "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body:    new URLSearchParams(
          Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v)]))
        ).toString(),
      });

      if (!res.ok) {
        if (res.status === 429) throw new Error("429 rate limit");
        throw Object.assign(new Error(`HTTP ${res.status}`), { code: ErrorCode.NETWORK_ERROR });
      }

      const data: EtherscanResponse<T> = await res.json() as EtherscanResponse<T>;
      if (data.status === "0") {
        throw Object.assign(new Error(String(data.result ?? data.message)), { code: ErrorCode.ETHERSCAN_API_ERROR });
      }
      return data.result;
    });
  }
}
