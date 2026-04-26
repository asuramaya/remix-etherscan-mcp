import { describe, it, expect } from "vitest";
import { listAbis, getAbi, WELL_KNOWN_ABIS } from "../abi/registry.js";

describe("listAbis()", () => {
  it("returns an entry for every key in WELL_KNOWN_ABIS", () => {
    const list = listAbis();
    expect(list.map(e => e.key).sort()).toEqual(Object.keys(WELL_KNOWN_ABIS).sort());
  });

  it("every entry has key, name, and description", () => {
    for (const entry of listAbis()) {
      expect(entry.key).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it("includes the expected well-known keys", () => {
    const keys = listAbis().map(e => e.key);
    expect(keys).toContain("erc20");
    expect(keys).toContain("erc721");
    expect(keys).toContain("erc1155");
    expect(keys).toContain("weth");
    expect(keys).toContain("uniswap-v2-pair");
    expect(keys).toContain("uniswap-v3-pool");
    expect(keys).toContain("gnosis-safe");
    expect(keys).toContain("ownable");
    expect(keys).toContain("erc4626");
  });
});

describe("getAbi()", () => {
  it("returns the erc20 entry", () => {
    const entry = getAbi("erc20");
    expect(entry).toBeDefined();
    expect(entry!.name).toBe("ERC-20");
    expect(Array.isArray(entry!.abi)).toBe(true);
  });

  it("returns undefined for unknown key", () => {
    expect(getAbi("not-a-real-abi")).toBeUndefined();
  });

  it("is case-insensitive", () => {
    expect(getAbi("ERC20")).toBeDefined();
    expect(getAbi("GNOSIS-SAFE")).toBeDefined();
    expect(getAbi("UniSwap-V2-Pair")).toBeDefined();
  });

  it("erc20 ABI contains transfer, transferFrom, approve, balanceOf", () => {
    const abi = getAbi("erc20")!.abi as Array<{ type: string; name: string }>;
    const fns = abi.filter(f => f.type === "function").map(f => f.name);
    expect(fns).toContain("transfer");
    expect(fns).toContain("transferFrom");
    expect(fns).toContain("approve");
    expect(fns).toContain("balanceOf");
    expect(fns).toContain("allowance");
    expect(fns).toContain("totalSupply");
  });

  it("erc20 ABI contains Transfer and Approval events", () => {
    const abi = getAbi("erc20")!.abi as Array<{ type: string; name: string }>;
    const events = abi.filter(f => f.type === "event").map(f => f.name);
    expect(events).toContain("Transfer");
    expect(events).toContain("Approval");
  });

  it("erc721 ABI contains ownerOf and safeTransferFrom", () => {
    const abi = getAbi("erc721")!.abi as Array<{ type: string; name: string }>;
    const fns = abi.filter(f => f.type === "function").map(f => f.name);
    expect(fns).toContain("ownerOf");
    expect(fns).toContain("safeTransferFrom");
  });

  it("gnosis-safe ABI contains execTransaction", () => {
    const abi = getAbi("gnosis-safe")!.abi as Array<{ type: string; name: string }>;
    const fns = abi.filter(f => f.type === "function").map(f => f.name);
    expect(fns).toContain("execTransaction");
    expect(fns).toContain("getOwners");
    expect(fns).toContain("getThreshold");
  });

  it("uniswap-v2-pair ABI contains getReserves and Swap event", () => {
    const abi = getAbi("uniswap-v2-pair")!.abi as Array<{ type: string; name: string }>;
    const fns   = abi.filter(f => f.type === "function").map(f => f.name);
    const events = abi.filter(f => f.type === "event").map(f => f.name);
    expect(fns).toContain("getReserves");
    expect(fns).toContain("swap");
    expect(events).toContain("Swap");
  });

  it("weth ABI contains deposit and withdraw", () => {
    const abi = getAbi("weth")!.abi as Array<{ type: string; name: string }>;
    const fns = abi.filter(f => f.type === "function").map(f => f.name);
    expect(fns).toContain("deposit");
    expect(fns).toContain("withdraw");
  });

  it("ownable ABI contains transferOwnership", () => {
    const abi = getAbi("ownable")!.abi as Array<{ type: string; name: string }>;
    const fns = abi.filter(f => f.type === "function").map(f => f.name);
    expect(fns).toContain("owner");
    expect(fns).toContain("transferOwnership");
    expect(fns).toContain("renounceOwnership");
  });
});
