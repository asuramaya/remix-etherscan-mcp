import { describe, it, expect, vi, afterEach } from "vitest";
import { weiToEth } from "../tools/schemas.js";

// Test the EtherscanClient error-handling logic without making real HTTP requests.
// We mock globalThis.fetch to simulate Etherscan v2 API responses.

const MOCK_API_KEY = "test-api-key-1234";

// Minimal config matching what EtherscanClient expects
const mockConfig = {
  etherscanApiKey:  MOCK_API_KEY,
  defaultChainId:   1,
  remixdWorkspace:  "./workspace",
  remixdReadOnly:   false,
  remixIdeUrl:      "https://remix.ethereum.org",
  sourcifyFallback: false,
  dbPath:           "/tmp/test-store.json",
};

async function makeClient() {
  const { EtherscanClient } = await import("../etherscan/client.js");
  return new EtherscanClient(mockConfig);
}

function mockFetch(response: object, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok:     status < 400,
    status,
    json:   async () => response,
  } as Response);
}

describe("EtherscanClient — successful responses", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns result for a standard {status:1, result} response", async () => {
    const client = await makeClient();
    mockFetch({ status: "1", message: "OK", result: "42" });
    const result = await client.get<string>("stats", "ethsupply", {});
    expect(result).toBe("42");
  });

  it("passes chainId in the query string", async () => {
    const client = await makeClient();
    const spy = mockFetch({ status: "1", message: "OK", result: [] });
    await client.get("account", "txlist", { address: "0x" + "a".repeat(40) }, 137);
    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain("chainid=137");
  });

  it("uses defaultChainId when chainId is omitted", async () => {
    const client = await makeClient();
    const spy = mockFetch({ status: "1", message: "OK", result: [] });
    await client.get("stats", "ethprice", {});
    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain("chainid=1");
  });

  it("includes apikey in the query string", async () => {
    const client = await makeClient();
    const spy = mockFetch({ status: "1", message: "OK", result: "0x0" });
    await client.get("proxy", "eth_blockNumber", {});
    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain(`apikey=${MOCK_API_KEY}`);
  });
});

describe("EtherscanClient — error handling", () => {
  afterEach(() => vi.restoreAllMocks());

  it("throws on status=0 response", async () => {
    const client = await makeClient();
    mockFetch({ status: "0", message: "NOTOK", result: "Contract source code not verified" });
    await expect(client.get("contract", "getsourcecode", { address: "0x" + "a".repeat(40) })).rejects.toThrow();
  });

  it("throws on JSON-RPC error response (proxy endpoints)", async () => {
    const client = await makeClient();
    mockFetch({ jsonrpc: "2.0", id: 1, error: { code: -32000, message: "execution reverted" } });
    await expect(client.get("proxy", "eth_call", { to: "0x" + "a".repeat(40), data: "0x", tag: "latest" })).rejects.toThrow(/execution reverted/i);
  });

  it("throws on HTTP 429 (rate limit)", async () => {
    const client = await makeClient();
    // Stub fetch to return 429 every call so retries all fail
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 429, json: async () => ({}),
    } as Response);
    await expect(client.get("stats", "ethprice", {})).rejects.toThrow(/rate limit/i);
  });

  it("throws on HTTP 500 (network error)", async () => {
    const client = await makeClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false, status: 500, json: async () => ({}),
    } as Response);
    await expect(client.get("stats", "ethprice", {})).rejects.toThrow(/HTTP 500/i);
  });

  it("throws when JSON-RPC error message contains 'rate limit'", async () => {
    const client = await makeClient();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ jsonrpc: "2.0", error: { code: -32005, message: "rate limit exceeded" } }),
    } as Response);
    await expect(client.get("proxy", "eth_blockNumber", {})).rejects.toThrow(/rate limit/i);
  });
});

describe("EtherscanClient — weiToEth helper", () => {
  it("formats 1 ETH correctly", () => {
    expect(weiToEth("1000000000000000000")).toBe("1");
  });

  it("formats 0 wei", () => {
    expect(weiToEth("0")).toBe("0");
  });

  it("formats 1.5 ETH", () => {
    expect(weiToEth("1500000000000000000")).toBe("1.5");
  });

  it("accepts BigInt input", () => {
    expect(weiToEth(2_000_000_000_000_000_000n)).toBe("2");
  });
});
