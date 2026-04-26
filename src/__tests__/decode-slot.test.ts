import { describe, it, expect } from "vitest";
import { decodeSlotValue } from "../tools/analysis.js";
import type { StorageType } from "../tools/analysis.js";

function makeType(label: string, bytes: number, encoding = "inplace"): StorageType {
  return { encoding, label, numberOfBytes: String(bytes) };
}

// A full 32-byte slot of zeros (hex, no 0x prefix assumed inside helper)
const ZERO_SLOT = "0x" + "00".repeat(32);

// Helpers to build slot values
function slot(hex: string): string {
  // Pad to 32 bytes (64 hex chars), left-padded (big-endian slot)
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  return "0x" + clean.padStart(64, "0");
}

// ── bool ──────────────────────────────────────────────────────────────────────

describe("decodeSlotValue — bool", () => {
  const t = makeType("bool", 1);

  it("decodes false (zero byte)", () => {
    expect(decodeSlotValue(ZERO_SLOT, t, 0)).toBe(false);
  });

  it("decodes true (0x01 in lowest byte)", () => {
    expect(decodeSlotValue(slot("01"), t, 0)).toBe(true);
  });
});

// ── uint256 ───────────────────────────────────────────────────────────────────

describe("decodeSlotValue — uint256", () => {
  const t = makeType("uint256", 32);

  it("decodes zero", () => {
    expect(decodeSlotValue(ZERO_SLOT, t, 0)).toBe("0");
  });

  it("decodes 1", () => {
    expect(decodeSlotValue(slot("01"), t, 0)).toBe("1");
  });

  it("decodes a large value", () => {
    const big = 1_000_000_000_000_000_000n; // 1 ETH in wei
    expect(decodeSlotValue(slot(big.toString(16)), t, 0)).toBe(big.toString());
  });

  it("decodes uint128 (16 bytes)", () => {
    const t128 = makeType("uint128", 16);
    expect(decodeSlotValue(slot("0a"), t128, 0)).toBe("10");
  });
});

// ── int256 ────────────────────────────────────────────────────────────────────

describe("decodeSlotValue — int256", () => {
  const t = makeType("int256", 32);

  it("decodes positive value", () => {
    expect(decodeSlotValue(slot("2a"), t, 0)).toBe("42");
  });

  it("decodes -1 (all ff bytes)", () => {
    const negOne = "0x" + "ff".repeat(32);
    expect(decodeSlotValue(negOne, t, 0)).toBe("-1");
  });

  it("decodes -1000", () => {
    // -1000 in two's complement int256: 2^256 - 1000
    const val  = (1n << 256n) - 1000n;
    const hex  = val.toString(16);
    const raw  = "0x" + hex.padStart(64, "0");
    expect(decodeSlotValue(raw, t, 0)).toBe("-1000");
  });

  it("decodes int128 — negative", () => {
    const t128 = makeType("int128", 16);
    // -1 in two's complement int128
    const negOne = "0x" + "ff".repeat(32);
    expect(decodeSlotValue(negOne, t128, 0)).toBe("-1");
  });
});

// ── address ───────────────────────────────────────────────────────────────────

describe("decodeSlotValue — address", () => {
  const t = makeType("address", 20);

  it("decodes zero address", () => {
    const result = decodeSlotValue(ZERO_SLOT, t, 0);
    expect((result as string).toLowerCase()).toBe("0x" + "0".repeat(40));
  });

  it("decodes a non-zero address", () => {
    const addr = "d8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const result = decodeSlotValue(slot(addr), t, 0);
    expect((result as string).toLowerCase()).toBe("0x" + addr.toLowerCase());
  });
});

// ── bytes32 ───────────────────────────────────────────────────────────────────

describe("decodeSlotValue — bytes32", () => {
  const t = makeType("bytes32", 32);

  it("returns 0x-prefixed hex for bytes32", () => {
    const result = decodeSlotValue(slot("deadbeef"), t, 0);
    expect(result as string).toMatch(/^0x[0-9a-f]+$/);
  });

  it("decodes bytes4", () => {
    const t4 = makeType("bytes4", 4);
    const result = decodeSlotValue(slot("08c379a0"), t4, 0);
    expect(result as string).toMatch(/^0x/);
  });
});

// ── packing (offset > 0) ──────────────────────────────────────────────────────

describe("decodeSlotValue — packed types (non-zero offset)", () => {
  // Simulate a slot with two packed uint128 values:
  // high 16 bytes = value B, low 16 bytes = value A (Solidity packs low→high)
  // slot layout: [B (bytes 16-31)] [A (bytes 0-15)]

  it("reads value at offset 0 (low bytes)", () => {
    // low 16 bytes = 7, high 16 bytes = 99
    const low  = (7n).toString(16).padStart(32, "0");
    const high = (99n).toString(16).padStart(32, "0");
    const raw  = "0x" + high + low;
    const t128 = makeType("uint128", 16);
    expect(decodeSlotValue(raw, t128, 0)).toBe("7");
  });

  it("reads value at offset 16 (high bytes)", () => {
    const low  = (7n).toString(16).padStart(32, "0");
    const high = (99n).toString(16).padStart(32, "0");
    const raw  = "0x" + high + low;
    const t128 = makeType("uint128", 16);
    expect(decodeSlotValue(raw, t128, 16)).toBe("99");
  });

  it("reads bool at offset 1 (above another bool at offset 0)", () => {
    // slot: ...0101  → byte at offset 0 = 0x01 (true), byte at offset 1 = 0x01 (true)
    const raw  = "0x" + "00".repeat(30) + "0101";
    const tbool = makeType("bool", 1);
    expect(decodeSlotValue(raw, tbool, 0)).toBe(true);
    expect(decodeSlotValue(raw, tbool, 1)).toBe(true);
  });
});
