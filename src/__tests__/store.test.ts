import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PersistentStore, Namespace } from "../db/store.js";

function tmpFile(): string {
  return path.join(os.tmpdir(), `store-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

describe("PersistentStore — basic CRUD", () => {
  let file: string;
  let store: PersistentStore;

  beforeEach(() => {
    file  = tmpFile();
    store = new PersistentStore(file);
  });

  afterEach(() => {
    try { fs.unlinkSync(file); } catch { /* ok */ }
    try { fs.unlinkSync(file + ".tmp"); } catch { /* ok */ }
  });

  it("returns undefined for a missing key", () => {
    expect(store.get("nope")).toBeUndefined();
  });

  it("stores and retrieves a string", () => {
    store.set("k", "hello");
    expect(store.get("k")).toBe("hello");
  });

  it("stores and retrieves a number", () => {
    store.set("n", 42);
    expect(store.get<number>("n")).toBe(42);
  });

  it("stores and retrieves an object", () => {
    store.set("obj", { a: 1, b: "two" });
    expect(store.get("obj")).toEqual({ a: 1, b: "two" });
  });

  it("overwrites an existing key", () => {
    store.set("k", "first");
    store.set("k", "second");
    expect(store.get("k")).toBe("second");
  });

  it("deletes a key", () => {
    store.set("k", "v");
    store.delete("k");
    expect(store.get("k")).toBeUndefined();
  });

  it("deleting a non-existent key is a no-op", () => {
    expect(() => store.delete("ghost")).not.toThrow();
  });

  it("size() counts non-expired entries", () => {
    store.set("a", 1);
    store.set("b", 2);
    expect(store.size()).toBe(2);
  });

  it("size() excludes deleted entries", () => {
    store.set("a", 1);
    store.set("b", 2);
    store.delete("a");
    expect(store.size()).toBe(1);
  });

  it("keys() returns all stored keys", () => {
    store.set("x", 1);
    store.set("y", 2);
    const k = store.keys().sort();
    expect(k).toEqual(["x", "y"]);
  });

  it("keys(prefix) filters by prefix", () => {
    store.set("ns:a", 1);
    store.set("ns:b", 2);
    store.set("other:c", 3);
    const k = store.keys("ns:").sort();
    expect(k).toEqual(["ns:a", "ns:b"]);
  });

  it("clear() with no prefix removes everything", () => {
    store.set("a", 1);
    store.set("b", 2);
    store.clear();
    expect(store.size()).toBe(0);
  });

  it("clear(prefix) removes only matching keys", () => {
    store.set("ns:a", 1);
    store.set("ns:b", 2);
    store.set("other:c", 3);
    store.clear("ns:");
    expect(store.get("ns:a")).toBeUndefined();
    expect(store.get("ns:b")).toBeUndefined();
    expect(store.get("other:c")).toBe(3);
  });
});

describe("PersistentStore — TTL", () => {
  let file: string;
  let store: PersistentStore;

  beforeEach(() => {
    file  = tmpFile();
    store = new PersistentStore(file);
  });

  afterEach(() => {
    try { fs.unlinkSync(file); } catch { /* ok */ }
  });

  it("returns value before TTL expires", async () => {
    store.set("tmp", "alive", 5_000);
    expect(store.get("tmp")).toBe("alive");
  });

  it("returns undefined after TTL expires", async () => {
    store.set("tmp", "short-lived", 1); // 1 ms TTL
    await new Promise(r => setTimeout(r, 5));
    expect(store.get("tmp")).toBeUndefined();
  });

  it("expired entries don't count in size()", async () => {
    store.set("tmp", "x", 1);
    store.set("perm", "y");
    await new Promise(r => setTimeout(r, 5));
    expect(store.size()).toBe(1);
  });

  it("expired entries don't appear in keys()", async () => {
    store.set("tmp", "x", 1);
    store.set("perm", "y");
    await new Promise(r => setTimeout(r, 5));
    expect(store.keys()).toEqual(["perm"]);
  });
});

describe("PersistentStore — persistence", () => {
  it("loads data written by a previous instance", () => {
    const file = tmpFile();
    try {
      const s1 = new PersistentStore(file);
      s1.set("key", "stored-value");
      s1.flushSync();

      const s2 = new PersistentStore(file);
      expect(s2.get("key")).toBe("stored-value");
    } finally {
      try { fs.unlinkSync(file); } catch { /* ok */ }
    }
  });

  it("does not load expired entries on restart", async () => {
    const file = tmpFile();
    try {
      const s1 = new PersistentStore(file);
      s1.set("expired", "old", 1);
      await new Promise(r => setTimeout(r, 5));
      s1.flushSync();

      const s2 = new PersistentStore(file);
      expect(s2.get("expired")).toBeUndefined();
    } finally {
      try { fs.unlinkSync(file); } catch { /* ok */ }
    }
  });

  it("starts fresh when the file is corrupt JSON", () => {
    const file = tmpFile();
    try {
      fs.writeFileSync(file, "this is not json", "utf8");
      const store = new PersistentStore(file);
      expect(store.size()).toBe(0);
    } finally {
      try { fs.unlinkSync(file); } catch { /* ok */ }
    }
  });

  it("starts fresh when the file does not exist", () => {
    const store = new PersistentStore(tmpFile()); // file never created
    expect(store.size()).toBe(0);
  });

  it("flushSync writes atomically (no partial writes)", () => {
    const file = tmpFile();
    try {
      const store = new PersistentStore(file);
      store.set("key", "value");
      store.flushSync();

      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      expect(Object.keys(raw).length).toBe(1);
    } finally {
      try { fs.unlinkSync(file); } catch { /* ok */ }
    }
  });

  it("flushSync skips write when not dirty", () => {
    const file = tmpFile();
    try {
      const store = new PersistentStore(file);
      store.flushSync(); // nothing set — file should not be created
      expect(fs.existsSync(file)).toBe(false);
    } finally {
      try { fs.unlinkSync(file); } catch { /* ok */ }
    }
  });
});

describe("Namespace", () => {
  let store: PersistentStore;

  beforeEach(() => {
    store = new PersistentStore(tmpFile());
  });

  it("prefixes keys transparently", () => {
    const ns = store.ns("cursor");
    ns.set("addr:1:", 100);
    expect(store.get("cursor:addr:1:")).toBe(100);
  });

  it("isolates namespaces from each other", () => {
    const nsA = store.ns("a");
    const nsB = store.ns("b");
    nsA.set("key", "in-a");
    expect(nsB.get("key")).toBeUndefined();
  });

  it("has() returns true for existing key", () => {
    const ns = store.ns("ns");
    ns.set("k", "v");
    expect(ns.has("k")).toBe(true);
  });

  it("has() returns false for missing key", () => {
    const ns = store.ns("ns");
    expect(ns.has("missing")).toBe(false);
  });

  it("keys() strips the namespace prefix", () => {
    const ns = store.ns("cursor");
    ns.set("0xabc:1:", 10);
    ns.set("0xdef:1:", 20);
    const keys = ns.keys().sort();
    expect(keys).toEqual(["0xabc:1:", "0xdef:1:"]);
  });

  it("clear() only removes entries in this namespace", () => {
    const nsA = store.ns("source");
    const nsB = store.ns("label");
    nsA.set("contract", { abi: "[]" });
    nsB.set("addr", "Uniswap");
    nsA.clear();
    expect(nsA.get("contract")).toBeUndefined();
    expect(nsB.get("addr")).toBe("Uniswap");
  });

  it("delete() removes a single key in the namespace", () => {
    const ns = store.ns("ns");
    ns.set("a", 1);
    ns.set("b", 2);
    ns.delete("a");
    expect(ns.get("a")).toBeUndefined();
    expect(ns.get("b")).toBe(2);
  });

  it("TTL works through namespace", async () => {
    const ns = store.ns("ns");
    ns.set("short", "x", 1);
    await new Promise(r => setTimeout(r, 5));
    expect(ns.get("short")).toBeUndefined();
  });
});
