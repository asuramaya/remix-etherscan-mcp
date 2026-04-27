import { describe, it, expect, vi, afterEach } from "vitest";
import { ethers } from "ethers";
import { encodeCall } from "../abi/codec.js";

// Test call_contract and simulate_transaction logic without the MCP server.
// We test the encode/decode pipeline and the revert-decoding fallback path
// by replicating the logic inline (same pattern as other test files here).

// ── helpers ───────────────────────────────────────────────────────────────────

const MOCK_CONFIG = {
  etherscanApiKey:  "test-key",
  defaultChainId:   1,
  remixdWorkspace:  "./workspace",
  remixdReadOnly:   false,
  remixIdeUrl:      "https://remix.ethereum.org",
  sourcifyFallback: false,
  dbPath:           "/tmp/call-contract-test-store.json",
};

async function makeClient() {
  const { EtherscanClient } = await import("../etherscan/client.js");
  return new EtherscanClient(MOCK_CONFIG);
}

function mockFetch(result: unknown, ok = true, status = 200) {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue({
    ok, status,
    json: async () => ({ status: "1", message: "OK", result }),
  } as Response);
}

// ── encodeCall roundtrip (the core of call_contract) ─────────────────────────

describe("call_contract — calldata encoding", () => {
  it("encodes balanceOf(address) correctly", () => {
    const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const data = encodeCall("balanceOf(address) returns (uint256)", [addr]);
    expect(data.startsWith("0x70a08231")).toBe(true); // keccak4("balanceOf(address)")
    expect(data.length).toBe(2 + 8 + 64);             // 0x + selector + 32-byte arg
  });

  it("encodes no-arg name() correctly", () => {
    const data = encodeCall("name() returns (string)", []);
    expect(data).toMatch(/^0x[0-9a-f]{8}$/); // just 4-byte selector
  });

  it("encodes getReserves() correctly", () => {
    const data = encodeCall("getReserves() returns (uint112,uint112,uint32)", []);
    expect(data).toMatch(/^0x[0-9a-f]{8}$/);
  });

  it("encodes transfer(address,uint256) correctly", () => {
    const addr   = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
    const amount = 1_000n;
    const data   = encodeCall("transfer(address,uint256) returns (bool)", [addr, amount]);
    expect(data.startsWith("0xa9059cbb")).toBe(true); // keccak4("transfer(address,uint256)")
    expect(data.length).toBe(2 + 8 + 64 + 64);
  });
});

// ── result decoding ───────────────────────────────────────────────────────────

describe("call_contract — result decoding", () => {
  it("decodes a uint256 result from eth_call response", async () => {
    const client = await makeClient();
    const supply = 1_000_000_000n;
    const encoded = "0x" + supply.toString(16).padStart(64, "0");
    mockFetch(encoded);
    afterEach(() => vi.restoreAllMocks());

    const raw = await client.get<string>("proxy", "eth_call", { to: "0x" + "a".repeat(40), data: "0x18160ddd", tag: "latest" });
    const iface   = new ethers.Interface(["function totalSupply() returns (uint256)"]);
    const decoded = iface.decodeFunctionResult("totalSupply", raw);
    expect(decoded[0]).toBe(supply);
  });

  it("decodes a bool result (true)", async () => {
    const client = await makeClient();
    mockFetch("0x" + "00".repeat(31) + "01");
    afterEach(() => vi.restoreAllMocks());

    const raw   = await client.get<string>("proxy", "eth_call", { to: "0x" + "a".repeat(40), data: "0x1234", tag: "latest" });
    const iface = new ethers.Interface(["function approve(address,uint256) returns (bool)"]);
    const decoded = iface.decodeFunctionResult("approve", raw);
    expect(decoded[0]).toBe(true);
  });

  it("decodes a string result", async () => {
    const client = await makeClient();
    // ABI-encode "USDC" as a string return value
    const iface   = new ethers.Interface(["function name() returns (string)"]);
    const encoded = iface.encodeFunctionResult("name", ["USDC"]);
    mockFetch(encoded);
    afterEach(() => vi.restoreAllMocks());

    const raw   = await client.get<string>("proxy", "eth_call", { to: "0x" + "a".repeat(40), data: "0x06fdde03", tag: "latest" });
    const dec   = iface.decodeFunctionResult("name", raw);
    expect(dec[0]).toBe("USDC");
  });
});

// ── simulate_transaction — revert decoding ────────────────────────────────────

describe("simulate_transaction — revert handling", () => {
  afterEach(() => vi.restoreAllMocks());

  it("decodes Error(string) from revert data in error message", () => {
    // Simulate what happens when Etherscan surfaces revert hex in an error message
    const iface   = new ethers.Interface(["function Error(string)"]);
    const revData = iface.encodeFunctionData("Error", ["Ownable: caller is not the owner"]);

    // The simulate path extracts hex from the error message
    const errorMsg = `execution reverted: ${revData}`;
    const hexMatch = /0x[0-9a-fA-F]{8,}/.exec(errorMsg);
    expect(hexMatch).not.toBeNull();
    expect(hexMatch![0]).toBe(revData);
  });

  it("returns 0x when no hex in error message", () => {
    const errorMsg = "execution reverted";
    const hexMatch = /0x[0-9a-fA-F]{8,}/.exec(errorMsg);
    expect(hexMatch).toBeNull();
    // raw falls back to "0x"
    const raw = hexMatch ? hexMatch[0] : "0x";
    expect(raw).toBe("0x");
  });

  it("encodes value as hex when decimal is provided", () => {
    const value    = "1000000000000000000"; // 1 ETH in wei (decimal)
    const asHex    = `0x${BigInt(value).toString(16)}`;
    expect(asHex).toBe("0xde0b6b3a7640000");
  });

  it("leaves value unchanged when already hex", () => {
    const value = "0xde0b6b3a7640000";
    const result = value.startsWith("0x") ? value : `0x${BigInt(value).toString(16)}`;
    expect(result).toBe("0xde0b6b3a7640000");
  });
});

// ── simulate_transaction — success path ──────────────────────────────────────

describe("simulate_transaction — success path", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes from address in eth_call params", async () => {
    const client = await makeClient();
    const spy    = mockFetch("0x" + "00".repeat(31) + "01");

    const from = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    await client.get<string>("proxy", "eth_call", {
      to:   "0x" + "a".repeat(40),
      data: "0xabcd",
      from,
      tag:  "latest",
    });

    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain("from=");
  });

  it("includes chainId in the request", async () => {
    const client = await makeClient();
    const spy    = mockFetch("0x1");

    await client.get<string>("proxy", "eth_call", { to: "0x" + "a".repeat(40), data: "0x", tag: "latest" }, 137);
    const url = spy.mock.calls[0]![0] as string;
    expect(url).toContain("chainid=137");
  });
});
