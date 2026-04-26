import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { FSClient } from "../remixd/fs.js";

async function mkTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "fsdiff-"));
}

async function rmDir(p: string) {
  await fs.rm(p, { recursive: true, force: true });
}

describe("FSClient.diff()", () => {
  let root: string;
  let fsc:  FSClient;

  beforeEach(async () => {
    root = await mkTmpDir();
    fsc  = new FSClient(root, false);
  });

  afterEach(() => rmDir(root));

  it("returns an empty patch for two identical files", async () => {
    const content = "pragma solidity ^0.8.0;\ncontract Foo {}";
    await fs.writeFile(path.join(root, "a.sol"), content);
    await fs.writeFile(path.join(root, "b.sol"), content);

    const result = await fsc.diff("a.sol", "b.sol");
    expect(result.src).toBe("a.sol");
    expect(result.dest).toBe("b.sol");
    expect(result.hunks).toBe(0);
    // Patch header still present but no hunk blocks
    expect(result.patch).toContain("a.sol");
    expect(result.patch).not.toContain("@@");
  });

  it("returns a non-empty patch for differing files", async () => {
    await fs.writeFile(path.join(root, "old.sol"), "contract Old {}");
    await fs.writeFile(path.join(root, "new.sol"), "contract New {}");

    const result = await fsc.diff("old.sol", "new.sol");
    expect(result.hunks).toBeGreaterThan(0);
    expect(result.patch).toContain("@@");
    expect(result.patch).toContain("-contract Old");
    expect(result.patch).toContain("+contract New");
  });

  it("reports correct hunk count for multiple changed regions", async () => {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");
    await fs.writeFile(path.join(root, "src.txt"), lines);

    const modified = lines
      .replace("line 2",  "LINE TWO")
      .replace("line 18", "LINE EIGHTEEN");
    await fs.writeFile(path.join(root, "dst.txt"), modified);

    const result = await fsc.diff("src.txt", "dst.txt");
    expect(result.hunks).toBe(2);
  });

  it("treats a missing file as empty content (one-sided diff)", async () => {
    await fs.writeFile(path.join(root, "existing.sol"), "contract A {}");
    // "missing.sol" does not exist — treated as empty

    const result = await fsc.diff("existing.sol", "missing.sol");
    expect(result.hunks).toBeGreaterThan(0);
    expect(result.patch).toContain("-contract A");
  });

  it("blocks path traversal on src", async () => {
    await expect(fsc.diff("../evil.txt", "ok.txt")).rejects.toThrow(/traversal/i);
  });

  it("blocks path traversal on dest", async () => {
    await fs.writeFile(path.join(root, "ok.txt"), "x");
    await expect(fsc.diff("ok.txt", "../evil.txt")).rejects.toThrow(/traversal/i);
  });

  it("returns patch as a unified diff string", async () => {
    await fs.writeFile(path.join(root, "f.sol"), "line one\nline two");
    await fs.writeFile(path.join(root, "g.sol"), "line one\nline THREE");

    const { patch } = await fsc.diff("f.sol", "g.sol");
    expect(typeof patch).toBe("string");
    expect(patch).toContain("--- f.sol");
    expect(patch).toContain("+++ g.sol");
  });
});
