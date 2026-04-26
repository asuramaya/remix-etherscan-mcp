import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { encodeCall, decodeResult, decodeLog, decodeCalldata, serialise } from "../abi/codec.js";

// ── encodeCall ──────────────────────────────────────────────────────────────

describe("encodeCall", () => {
  it("encodes a no-arg function", () => {
    const data = encodeCall("totalSupply() returns (uint256)", []);
    expect(data).toMatch(/^0x[0-9a-f]{8}$/); // 4-byte selector
  });

  it("encodes balanceOf(address)", () => {
    const data = encodeCall("balanceOf(address) returns (uint256)", ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"]);
    expect(data.startsWith("0x70a08231")).toBe(true); // keccak4("balanceOf(address)")
    expect(data.length).toBe(2 + 8 + 64); // 0x + selector + 32-byte arg
  });

  it("encodes transfer(address,uint256)", () => {
    const data = encodeCall("transfer(address,uint256) returns (bool)", [
      "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      1000n,
    ]);
    expect(data).toMatch(/^0x[0-9a-f]+$/);
    expect(data.length).toBe(2 + 8 + 64 + 64); // selector + address + uint256
  });

  it("produces same selector for equivalent signatures", () => {
    const a = encodeCall("approve(address,uint256) returns (bool)", ["0x" + "a".repeat(40), 0n]);
    const b = encodeCall("approve(address,uint256) returns (bool)", ["0x" + "b".repeat(40), 0n]);
    expect(a.slice(0, 10)).toBe(b.slice(0, 10)); // same 4-byte selector
    expect(a).not.toBe(b);                         // different args
  });
});

// ── decodeResult ────────────────────────────────────────────────────────────

describe("decodeResult", () => {
  it("decodes a uint256 result", () => {
    // 1000n encoded as uint256
    const hex = "0x00000000000000000000000000000000000000000000000000000000000003e8";
    const result = decodeResult("totalSupply() returns (uint256)", hex);
    expect(result).toBe(1000n);
  });

  it("decodes a bool result (true)", () => {
    const hex = "0x0000000000000000000000000000000000000000000000000000000000000001";
    expect(decodeResult("approve(address,uint256) returns (bool)", hex)).toBe(true);
  });

  it("decodes a bool result (false)", () => {
    const hex = "0x0000000000000000000000000000000000000000000000000000000000000000";
    expect(decodeResult("approve(address,uint256) returns (bool)", hex)).toBe(false);
  });

  it("decodes an address result", () => {
    const addr = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const padded = "0x000000000000000000000000" + addr.slice(2).toLowerCase();
    const result = decodeResult("owner() returns (address)", padded);
    expect((result as string).toLowerCase()).toBe(addr.toLowerCase());
  });
});

// ── decodeLog ───────────────────────────────────────────────────────────────

describe("decodeLog", () => {
  const ERC20_TRANSFER_ABI = [{
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from",  type: "address", indexed: true  },
      { name: "to",    type: "address", indexed: true  },
      { name: "value", type: "uint256", indexed: false },
    ],
  }];

  it("decodes an ERC-20 Transfer log", () => {
    const from  = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const to    = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
    const value = 500n;

    // Build topics and data that ethers can parse back
    const iface = new ethers.Interface(ERC20_TRANSFER_ABI as ethers.InterfaceAbi);
    const encoded = iface.encodeEventLog("Transfer", [from, to, value]);

    const result = decodeLog(ERC20_TRANSFER_ABI, encoded.topics, encoded.data);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Transfer");
    expect(result!.args["from"]?.toString().toLowerCase()).toBe(from.toLowerCase());
    expect(result!.args["to"]?.toString().toLowerCase()).toBe(to.toLowerCase());
    expect(result!.args["value"]).toBe("500");
  });

  it("returns null for unrecognised log", () => {
    const result = decodeLog(ERC20_TRANSFER_ABI, ["0x" + "0".repeat(64)], "0x");
    expect(result).toBeNull();
  });

  it("returns null for empty ABI", () => {
    expect(decodeLog([], ["0x" + "0".repeat(64)], "0x")).toBeNull();
  });
});

// ── decodeCalldata ─────────────────────────────────────────────────────────

describe("decodeCalldata", () => {
  const ERC20_ABI = [
    { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }] },
  ];

  it("decodes a transfer(address,uint256) calldata", () => {
    const to     = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
    const amount = 1_000_000n;
    const calldata = encodeCall("transfer(address,uint256) returns (bool)", [to, amount]);

    const result = decodeCalldata(ERC20_ABI, calldata);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("transfer");
    expect(result!.args["to"]?.toString().toLowerCase()).toBe(to.toLowerCase());
    expect(result!.args["amount"]).toBe("1000000");
  });

  it("returns null for zero calldata", () => {
    expect(decodeCalldata(ERC20_ABI, "0x")).toBeNull();
  });

  it("returns null for unrecognised selector", () => {
    expect(decodeCalldata(ERC20_ABI, "0xdeadbeef")).toBeNull();
  });
});

// ── serialise ───────────────────────────────────────────────────────────────

describe("serialise", () => {
  it("converts BigInt to string", () => {
    expect(serialise(1000n)).toBe("1000");
  });

  it("leaves strings unchanged", () => {
    expect(serialise("hello")).toBe("hello");
  });

  it("leaves numbers unchanged", () => {
    expect(serialise(42)).toBe(42);
  });

  it("leaves null unchanged", () => {
    expect(serialise(null)).toBeNull();
  });

  it("recursively converts BigInts in arrays", () => {
    expect(serialise([1n, 2n, 3n])).toEqual(["1", "2", "3"]);
  });

  it("recursively converts BigInts in objects", () => {
    expect(serialise({ a: 1n, b: "str", c: 42 })).toEqual({ a: "1", b: "str", c: 42 });
  });

  it("handles nested structures", () => {
    const input  = { outer: { inner: 999n, arr: [1n, "x"] } };
    const output = serialise(input);
    expect(output).toEqual({ outer: { inner: "999", arr: ["1", "x"] } });
  });

  it("is safe to JSON.stringify after serialisation", () => {
    const input  = { value: 123456789012345678901234567890n, label: "big" };
    const serial = serialise(input);
    expect(() => JSON.stringify(serial)).not.toThrow();
  });
});
