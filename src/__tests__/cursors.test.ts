import { describe, it, expect, beforeEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { initStore } from "../db/store.js";
import { getCursor, setCursor, resetCursor } from "../state/cursors.js";

// Reinitialise the singleton store before each test to keep them isolated
beforeEach(() => {
  initStore(path.join(os.tmpdir(), `cursors-test-${Date.now()}.json`));
});

describe("cursor state", () => {
  const ADDR   = "0xd8da6bf26964af9d7eed9e03e53415d37aa96045";
  const CHAIN  = 1;
  const TOPIC0 = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

  it("returns undefined when no cursor is set", () => {
    expect(getCursor(ADDR, CHAIN)).toBeUndefined();
  });

  it("stores and retrieves a block cursor", () => {
    setCursor(ADDR, CHAIN, 18_000_000);
    expect(getCursor(ADDR, CHAIN)).toBe(18_000_000);
  });

  it("updates an existing cursor", () => {
    setCursor(ADDR, CHAIN, 1000);
    setCursor(ADDR, CHAIN, 2000);
    expect(getCursor(ADDR, CHAIN)).toBe(2000);
  });

  it("resets a cursor to undefined", () => {
    setCursor(ADDR, CHAIN, 500);
    resetCursor(ADDR, CHAIN);
    expect(getCursor(ADDR, CHAIN)).toBeUndefined();
  });

  it("isolates cursors by chain ID", () => {
    setCursor(ADDR, 1, 100);
    setCursor(ADDR, 137, 999);
    expect(getCursor(ADDR, 1)).toBe(100);
    expect(getCursor(ADDR, 137)).toBe(999);
  });

  it("isolates cursors by address (case-insensitive)", () => {
    const upper = ADDR.toUpperCase();
    const lower = ADDR.toLowerCase();
    setCursor(upper, CHAIN, 42);
    expect(getCursor(lower, CHAIN)).toBe(42); // key normalised to lowercase
  });

  it("isolates cursors by topic0", () => {
    setCursor(ADDR, CHAIN, 10);
    setCursor(ADDR, CHAIN, 20, TOPIC0);
    expect(getCursor(ADDR, CHAIN)).toBe(10);
    expect(getCursor(ADDR, CHAIN, TOPIC0)).toBe(20);
  });

  it("reset with topic0 only removes that cursor", () => {
    setCursor(ADDR, CHAIN, 10);
    setCursor(ADDR, CHAIN, 20, TOPIC0);
    resetCursor(ADDR, CHAIN, TOPIC0);
    expect(getCursor(ADDR, CHAIN)).toBe(10);       // untouched
    expect(getCursor(ADDR, CHAIN, TOPIC0)).toBeUndefined();
  });
});
