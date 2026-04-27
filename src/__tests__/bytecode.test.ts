import { describe, it, expect } from "vitest";
import { extractSelectors, detectStandards } from "../tools/bytecode.js";

// ── extractSelectors ──────────────────────────────────────────────────────────

describe("extractSelectors", () => {
  it("returns empty array for empty bytecode", () => {
    expect(extractSelectors("0x")).toEqual([]);
    expect(extractSelectors("")).toEqual([]);
  });

  it("detects a single PUSH4+EQ pattern", () => {
    // PUSH4 (0x63) + 4 selector bytes + EQ (0x14)
    const selector = "70a08231"; // balanceOf(address)
    const bytecode = `0x63${selector}14`;
    const result = extractSelectors(bytecode);
    expect(result).toContain(`0x${selector}`);
  });

  it("detects multiple selectors", () => {
    // Two back-to-back PUSH4+EQ patterns
    const s1 = "70a08231"; // balanceOf
    const s2 = "a9059cbb"; // transfer
    const bytecode = `0x63${s1}1463${s2}14`;
    const result = extractSelectors(bytecode);
    expect(result).toContain(`0x${s1}`);
    expect(result).toContain(`0x${s2}`);
    expect(result).toHaveLength(2);
  });

  it("deduplicates repeated selectors", () => {
    const s = "70a08231";
    const bytecode = `0x63${s}1463${s}14`;
    expect(extractSelectors(bytecode)).toHaveLength(1);
  });

  it("ignores PUSH4 not followed by EQ", () => {
    // PUSH4 + 4 bytes + NOT 0x14
    const bytecode = "0x63" + "12345678" + "15"; // 0x15 = ISZERO, not EQ
    expect(extractSelectors(bytecode)).toEqual([]);
  });

  it("works without 0x prefix", () => {
    const s = "18160ddd"; // totalSupply
    const bytecode = `63${s}14`;
    expect(extractSelectors(bytecode)).toContain(`0x${s}`);
  });

  it("returns lowercase selectors", () => {
    const bytecode = "0x63DEADBEEF14";
    const result = extractSelectors(bytecode);
    expect(result[0]).toBe("0xdeadbeef");
  });
});

// ── detectStandards ───────────────────────────────────────────────────────────

const ERC20_SELECTORS = [
  "0x18160ddd", // totalSupply
  "0x70a08231", // balanceOf
  "0xa9059cbb", // transfer
  "0x23b872dd", // transferFrom
  "0x095ea7b3", // approve
];

const ERC721_SELECTORS = [
  "0x6352211e", // ownerOf
  "0x42842e0e", // safeTransferFrom(address,address,uint256)
];

const ERC1155_SELECTORS = [
  "0x4e1273f4", // balanceOfBatch
  "0xf242432a", // safeTransferFrom(address,address,uint256,uint256,bytes)
];

describe("detectStandards", () => {
  it("returns empty array for no selectors", () => {
    expect(detectStandards([])).toEqual([]);
  });

  it("detects ERC-20 when all 5 required selectors present", () => {
    expect(detectStandards(ERC20_SELECTORS)).toContain("ERC-20");
  });

  it("does not detect ERC-20 when one required selector is missing", () => {
    const partial = ERC20_SELECTORS.slice(0, 4); // missing approve
    expect(detectStandards(partial)).not.toContain("ERC-20");
  });

  it("detects ERC-721 when ownerOf + safeTransferFrom present", () => {
    expect(detectStandards(ERC721_SELECTORS)).toContain("ERC-721");
  });

  it("detects ERC-1155 when required selectors present", () => {
    expect(detectStandards(ERC1155_SELECTORS)).toContain("ERC-1155");
  });

  it("detects Proxy via implementation() selector", () => {
    expect(detectStandards(["0x5c60da1b"])).toContain("Proxy");
  });

  it("detects Proxy via upgradeTo() selector", () => {
    expect(detectStandards(["0x3659cfe6"])).toContain("Proxy");
  });

  it("detects Ownable when owner() + transferOwnership() present", () => {
    expect(detectStandards(["0x8da5cb5b", "0xf2fde38b"])).toContain("Ownable");
  });

  it("does not detect Ownable when only owner() is present", () => {
    expect(detectStandards(["0x8da5cb5b"])).not.toContain("Ownable");
  });

  it("detects Gnosis Safe", () => {
    expect(detectStandards(["0x6a761202", "0xa0e67e2b"])).toContain("Gnosis Safe");
  });

  it("detects AccessControl", () => {
    expect(detectStandards(["0x91d14854", "0x2f2ff15d"])).toContain("AccessControl");
  });

  it("detects ERC-4626", () => {
    expect(detectStandards(["0x6e553f65", "0x2e1a7d4d"])).toContain("ERC-4626");
  });

  it("detects Uniswap V2 Pair via getReserves()", () => {
    expect(detectStandards(["0x0902f1ac"])).toContain("Uniswap V2 Pair");
  });

  it("detects Uniswap V3 Pool via slot0()", () => {
    expect(detectStandards(["0x3850c7bd"])).toContain("Uniswap V3 Pool");
  });

  it("detects WETH via deposit()", () => {
    expect(detectStandards(["0xd0e30db0"])).toContain("WETH");
  });

  it("detects multiple standards simultaneously", () => {
    const all = [...ERC20_SELECTORS, "0x8da5cb5b", "0xf2fde38b", "0x5c60da1b"];
    const standards = detectStandards(all);
    expect(standards).toContain("ERC-20");
    expect(standards).toContain("Ownable");
    expect(standards).toContain("Proxy");
  });
});
