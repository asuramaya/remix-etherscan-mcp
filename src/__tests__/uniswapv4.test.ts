import { describe, it, expect } from "vitest";
import { decodeHookPermissions, poolIdFromKey } from "../tools/uniswapv4.js";

describe("decodeHookPermissions", () => {
  it("returns hookless for the zero address", () => {
    const r = decodeHookPermissions("0x0000000000000000000000000000000000000000");
    expect(r.hookless).toBe(true);
    expect(r.flags).toEqual([]);
  });

  it("decodes BEFORE_SWAP + AFTER_SWAP + return-deltas (TokenpadHook layout)", () => {
    // Tokenpad uses: beforeSwap=true, afterSwap=true, beforeSwapReturnsDelta=true, afterSwapReturnsDelta=true
    // Bits 7,6,3,2 set → 0b00_0011_0000_1100 = 0x00cc
    // Address ends in ...00cc to satisfy CREATE2 mining.
    const r = decodeHookPermissions("0x17b796af8d8d0e4cb0c7947487267cd48b3cc0cc");
    expect(r.hookless).toBe(false);
    expect(r.flags).toContain("BEFORE_SWAP");
    expect(r.flags).toContain("AFTER_SWAP");
    expect(r.flags).toContain("BEFORE_SWAP_RETURNS_DELTA");
    expect(r.flags).toContain("AFTER_SWAP_RETURNS_DELTA");
    expect(r.flags).not.toContain("BEFORE_INITIALIZE");
    expect(r.flags).not.toContain("BEFORE_ADD_LIQUIDITY");
  });

  it("decodes a single bit (BEFORE_INITIALIZE = bit 13 = 0x2000)", () => {
    const r = decodeHookPermissions("0x0000000000000000000000000000000000002000");
    expect(r.flags).toEqual(["BEFORE_INITIALIZE"]);
  });

  it("decodes the lowest bit (AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA = bit 0 = 0x0001)", () => {
    const r = decodeHookPermissions("0x0000000000000000000000000000000000000001");
    expect(r.flags).toEqual(["AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA"]);
  });

  it("ignores high bits (only lowest 14 bits encode permissions)", () => {
    // 0xff..ff0001 — only bit 0 should decode
    const r = decodeHookPermissions("0xffffffffffffffffffffffffffffffffffff0001");
    expect(r.flags).toEqual(["AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA"]);
  });
});

describe("poolIdFromKey", () => {
  it("produces a deterministic 32-byte hash", () => {
    const id = poolIdFromKey({
      currency0:   "0x0000000000000000000000000000000000000000",
      currency1:   "0x0699253c9dd45eac803777a2fe19bae09a4bbd55",
      fee:         3000,
      tickSpacing: 60,
      hooks:       "0x17b796af8d8d0e4cb0c7947487267cd48b3cc0cc",
    });
    expect(id).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("differs when fee changes", () => {
    const a = poolIdFromKey({
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x0699253c9dd45eac803777a2fe19bae09a4bbd55",
      fee: 3000, tickSpacing: 60,
      hooks: "0x17b796af8d8d0e4cb0c7947487267cd48b3cc0cc",
    });
    const b = poolIdFromKey({
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x0699253c9dd45eac803777a2fe19bae09a4bbd55",
      fee: 10000, tickSpacing: 60,
      hooks: "0x17b796af8d8d0e4cb0c7947487267cd48b3cc0cc",
    });
    expect(a).not.toBe(b);
  });

  it("differs when hooks address changes", () => {
    const a = poolIdFromKey({
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x0699253c9dd45eac803777a2fe19bae09a4bbd55",
      fee: 3000, tickSpacing: 60,
      hooks: "0x17b796af8d8d0e4cb0c7947487267cd48b3cc0cc",
    });
    const b = poolIdFromKey({
      currency0: "0x0000000000000000000000000000000000000000",
      currency1: "0x0699253c9dd45eac803777a2fe19bae09a4bbd55",
      fee: 3000, tickSpacing: 60,
      hooks: "0x0000000000000000000000000000000000000000",
    });
    expect(a).not.toBe(b);
  });
});
