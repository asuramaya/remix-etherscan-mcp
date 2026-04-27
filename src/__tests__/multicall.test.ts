import { describe, it, expect, vi, afterEach } from "vitest";
import { ethers } from "ethers";
import { encodeCall, decodeResult } from "../abi/codec.js";

// Test the multicall encoding/decoding pipeline without a live Multicall3 call.
// We verify: call encoding, aggregate3 ABI encoding, result decoding, and the
// allow_failure / revert-decoding paths — all using local ethers operations.

const AGGREGATE3_ABI = [
  "function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[] returnData)",
];
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

// Build an aggregate3 calldata batch and round-trip encode→decode it locally
function buildBatch(calls: Array<{ target: string; allowFailure: boolean; callData: string }>): string {
  const iface = new ethers.Interface(AGGREGATE3_ABI);
  return iface.encodeFunctionData("aggregate3", [calls]);
}

function decodeBatch(calldata: string): Array<{ target: string; allowFailure: boolean; callData: string }> {
  const iface   = new ethers.Interface(AGGREGATE3_ABI);
  const decoded = iface.decodeFunctionData("aggregate3", calldata);
  return (decoded[0] as Array<{ target: string; allowFailure: boolean; callData: string }>).map(c => ({
    target:        c.target,
    allowFailure:  c.allowFailure,
    callData:      c.callData,
  }));
}

function simulateAggregate3Response(results: Array<{ success: boolean; returnData: string }>): string {
  const iface = new ethers.Interface(AGGREGATE3_ABI);
  return iface.encodeFunctionResult("aggregate3", [results]);
}

// ── aggregate3 ABI encoding ───────────────────────────────────────────────────

describe("multicall — aggregate3 encoding", () => {
  const ADDR_A = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
  const ADDR_B = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // WETH

  it("produces a 0x-prefixed hex string", () => {
    const calls = [{ target: ADDR_A, allowFailure: true, callData: encodeCall("name() returns (string)", []) }];
    const cd    = buildBatch(calls);
    expect(cd).toMatch(/^0x[0-9a-f]+$/i);
  });

  it("round-trips a single call", () => {
    const callData = encodeCall("totalSupply() returns (uint256)", []);
    const batch    = buildBatch([{ target: ADDR_A, allowFailure: true, callData }]);
    const decoded  = decodeBatch(batch);
    expect(decoded).toHaveLength(1);
    expect(decoded[0]!.callData.toLowerCase()).toBe(callData.toLowerCase());
    expect(decoded[0]!.allowFailure).toBe(true);
  });

  it("round-trips multiple calls with different addresses", () => {
    const calls = [
      { target: ADDR_A, allowFailure: true,  callData: encodeCall("name() returns (string)", []) },
      { target: ADDR_B, allowFailure: false, callData: encodeCall("totalSupply() returns (uint256)", []) },
    ];
    const decoded = decodeBatch(buildBatch(calls));
    expect(decoded).toHaveLength(2);
    expect(decoded[0]!.allowFailure).toBe(true);
    expect(decoded[1]!.allowFailure).toBe(false);
  });

  it("preserves allow_failure=false for critical calls", () => {
    const callData = encodeCall("balanceOf(address) returns (uint256)", ["0x" + "a".repeat(40)]);
    const decoded  = decodeBatch(buildBatch([{ target: ADDR_A, allowFailure: false, callData }]));
    expect(decoded[0]!.allowFailure).toBe(false);
  });

  it("encodes up to 5 calls correctly", () => {
    const calls = Array.from({ length: 5 }, (_, i) => ({
      target:        ADDR_A,
      allowFailure:  true,
      callData:      encodeCall(`slot${i}() returns (uint256)`.replace(`slot${i}`, "totalSupply"), []),
    }));
    const decoded = decodeBatch(buildBatch(calls));
    expect(decoded).toHaveLength(5);
  });
});

// ── result decoding ───────────────────────────────────────────────────────────

describe("multicall — result decoding", () => {
  it("decodes a successful uint256 result", () => {
    const supply  = 1_000_000_000n;
    const rawHex  = "0x" + supply.toString(16).padStart(64, "0");
    const encoded = simulateAggregate3Response([{ success: true, returnData: rawHex }]);
    const iface   = new ethers.Interface(AGGREGATE3_ABI);
    const decoded = iface.decodeFunctionResult("aggregate3", encoded);
    const results = decoded[0] as Array<{ success: boolean; returnData: string }>;

    expect(results[0]!.success).toBe(true);
    const value = decodeResult("totalSupply() returns (uint256)", results[0]!.returnData);
    expect(value).toBe(supply);
  });

  it("decodes a successful bool result (true)", () => {
    const rawHex  = "0x" + "00".repeat(31) + "01";
    const encoded = simulateAggregate3Response([{ success: true, returnData: rawHex }]);
    const iface   = new ethers.Interface(AGGREGATE3_ABI);
    const decoded = iface.decodeFunctionResult("aggregate3", encoded);
    const results = decoded[0] as Array<{ success: boolean; returnData: string }>;

    const value = decodeResult("approve(address,uint256) returns (bool)", results[0]!.returnData);
    expect(value).toBe(true);
  });

  it("marks failed calls as success=false", () => {
    const revertData = "0x08c379a0" + "0".repeat(124); // Error(string) selector + padded empty
    const encoded    = simulateAggregate3Response([
      { success: true,  returnData: "0x" + "0".repeat(64) },
      { success: false, returnData: revertData },
    ]);
    const iface   = new ethers.Interface(AGGREGATE3_ABI);
    const decoded = iface.decodeFunctionResult("aggregate3", encoded);
    const results = decoded[0] as Array<{ success: boolean; returnData: string }>;

    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(false);
    expect(results[1]!.returnData.startsWith("0x08c379a0")).toBe(true);
  });

  it("decodes mixed success/failure batch", () => {
    const supply  = 500n;
    const rawGood = "0x" + supply.toString(16).padStart(64, "0");
    const rawBad  = "0x08c379a0" + "0".repeat(192); // Error(string) with empty message

    const encoded = simulateAggregate3Response([
      { success: true,  returnData: rawGood },
      { success: false, returnData: rawBad  },
      { success: true,  returnData: rawGood },
    ]);
    const iface   = new ethers.Interface(AGGREGATE3_ABI);
    const decoded = iface.decodeFunctionResult("aggregate3", encoded);
    const results = decoded[0] as Array<{ success: boolean; returnData: string }>;

    expect(results).toHaveLength(3);
    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(false);
    expect(results[2]!.success).toBe(true);
  });
});

// ── call encoding helpers ─────────────────────────────────────────────────────

describe("multicall — individual call encoding", () => {
  it("encodes balanceOf(address) correctly", () => {
    const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const cd   = encodeCall("balanceOf(address) returns (uint256)", [addr]);
    expect(cd.startsWith("0x70a08231")).toBe(true);
  });

  it("produces distinct calldata for different arg values", () => {
    const addr1 = "0x" + "a".repeat(40);
    const addr2 = "0x" + "b".repeat(40);
    const cd1   = encodeCall("balanceOf(address) returns (uint256)", [addr1]);
    const cd2   = encodeCall("balanceOf(address) returns (uint256)", [addr2]);
    expect(cd1.slice(0, 10)).toBe(cd2.slice(0, 10)); // same selector
    expect(cd1).not.toBe(cd2);                        // different args
  });

  it("Multicall3 address is the canonical deployment address", () => {
    expect(MULTICALL3.toLowerCase()).toBe("0xca11bde05977b3631167028862be2a173976ca11");
  });
});

// ── mock RPC round-trip ───────────────────────────────────────────────────────

describe("multicall — mock EtherscanClient round-trip", () => {
  afterEach(() => vi.restoreAllMocks());

  it("calls eth_call on the Multicall3 address", async () => {
    const { EtherscanClient } = await import("../etherscan/client.js");
    const client = new EtherscanClient({
      etherscanApiKey:  "test",
      defaultChainId:   1,
      remixdWorkspace:  "./",
      remixdReadOnly:   false,
      remixIdeUrl:      "https://remix.ethereum.org",
      sourcifyFallback: false,
      dbPath:           "/tmp/mc-test.json",
      rpcUrl:           null,
      anvilPort:        8545,
    });

    // Simulate aggregate3 returning one successful uint256 result
    const returnVal = simulateAggregate3Response([{ success: true, returnData: "0x" + "1".padStart(64, "0") }]);
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ status: "1", message: "OK", result: returnVal }),
    } as Response);

    await client.get<string>("proxy", "eth_call", { to: MULTICALL3, data: "0x", tag: "latest" });

    const url = (spy.mock.calls[0]![0] as string).toLowerCase();
    expect(url).toContain(MULTICALL3.toLowerCase());
    expect(url).toContain("eth_call");
  });
});
