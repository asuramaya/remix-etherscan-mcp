import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { FSClient } from "../remixd/fs.js";

async function mkTmpDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "fsc-test-"));
}

async function rmDir(p: string) {
  await fs.rm(p, { recursive: true, force: true });
}

// ── Path traversal ──────────────────────────────────────────────────────────

describe("FSClient — path traversal protection", () => {
  let root: string;
  let fsc: FSClient;

  beforeEach(async () => {
    root = await mkTmpDir();
    fsc  = new FSClient(root, false);
  });

  afterEach(() => rmDir(root));

  it("blocks ../traversal on read", async () => {
    await expect(fsc.read("../../../etc/passwd")).rejects.toThrow(/traversal/i);
  });

  it("blocks absolute path on read", async () => {
    await expect(fsc.read("/etc/passwd")).rejects.toThrow(/traversal/i);
  });

  it("blocks ../traversal on write", async () => {
    await expect(fsc.write("../evil.txt", "x")).rejects.toThrow(/traversal/i);
  });

  it("allows a simple relative path", async () => {
    await fs.writeFile(path.join(root, "safe.txt"), "content", "utf8");
    const result = await fsc.read("safe.txt");
    expect(result.content).toBe("content");
  });
});

// ── Read-only mode ──────────────────────────────────────────────────────────

describe("FSClient — read-only mode", () => {
  let root: string;
  let fsc: FSClient;

  beforeEach(async () => {
    root = await mkTmpDir();
    fsc  = new FSClient(root, true); // read-only
  });

  afterEach(() => rmDir(root));

  it("blocks write in read-only mode", async () => {
    await expect(fsc.write("file.txt", "x")).rejects.toThrow(/read.only/i);
  });

  it("blocks copy in read-only mode", async () => {
    await fs.writeFile(path.join(root, "src.txt"), "x");
    await expect(fsc.copy("src.txt", "dest.txt")).rejects.toThrow(/read.only/i);
  });

  it("blocks createDir in read-only mode", async () => {
    await expect(fsc.createDir("newdir")).rejects.toThrow(/read.only/i);
  });

  it("allows read in read-only mode", async () => {
    await fs.writeFile(path.join(root, "file.txt"), "hello");
    const r = await fsc.read("file.txt");
    expect(r.content).toBe("hello");
  });
});

// ── stat ────────────────────────────────────────────────────────────────────

describe("FSClient.stat()", () => {
  let root: string;
  let fsc: FSClient;

  beforeEach(async () => {
    root = await mkTmpDir();
    fsc  = new FSClient(root, false);
  });

  afterEach(() => rmDir(root));

  it("returns type=file for a file", async () => {
    await fs.writeFile(path.join(root, "file.sol"), "// SPDX");
    const s = await fsc.stat("file.sol");
    expect(s.type).toBe("file");
    expect(s.sizeBytes).toBeGreaterThan(0);
    expect(s.mtimeMs).toBeGreaterThan(0);
  });

  it("returns type=directory for a directory", async () => {
    await fs.mkdir(path.join(root, "contracts"));
    const s = await fsc.stat("contracts");
    expect(s.type).toBe("directory");
  });

  it("returns the correct path", async () => {
    await fs.writeFile(path.join(root, "x.txt"), "hi");
    expect((await fsc.stat("x.txt")).path).toBe("x.txt");
  });

  it("throws FILE_NOT_FOUND for non-existent path", async () => {
    await expect(fsc.stat("does-not-exist.sol")).rejects.toMatchObject({ code: "FILE_NOT_FOUND" });
  });
});

// ── copy ────────────────────────────────────────────────────────────────────

describe("FSClient.copy()", () => {
  let root: string;
  let fsc: FSClient;

  beforeEach(async () => {
    root = await mkTmpDir();
    fsc  = new FSClient(root, false);
  });

  afterEach(() => rmDir(root));

  it("copies a file to a new location", async () => {
    await fs.writeFile(path.join(root, "src.sol"), "contract A {}");
    await fsc.copy("src.sol", "dest.sol");
    const content = await fs.readFile(path.join(root, "dest.sol"), "utf8");
    expect(content).toBe("contract A {}");
  });

  it("creates parent directories for dest", async () => {
    await fs.writeFile(path.join(root, "src.sol"), "x");
    await fsc.copy("src.sol", "subdir/deep/dest.sol");
    const exists = await fs.access(path.join(root, "subdir/deep/dest.sol")).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it("copies a directory recursively", async () => {
    await fs.mkdir(path.join(root, "contracts"));
    await fs.writeFile(path.join(root, "contracts", "A.sol"), "contract A {}");
    await fs.writeFile(path.join(root, "contracts", "B.sol"), "contract B {}");
    await fsc.copy("contracts", "contracts-copy");
    const files = await fs.readdir(path.join(root, "contracts-copy"));
    expect(files.sort()).toEqual(["A.sol", "B.sol"]);
  });

  it("returns { src, dest, copied: true }", async () => {
    await fs.writeFile(path.join(root, "f.sol"), "x");
    const result = await fsc.copy("f.sol", "g.sol");
    expect(result).toEqual({ src: "f.sol", dest: "g.sol", copied: true });
  });
});

// ── buildGlobRe ─────────────────────────────────────────────────────────────

describe("FSClient.buildGlobRe() — static method", () => {
  // Access via the private static through a test-only hack (cast to any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const build = (g: string): RegExp => (FSClient as any).buildGlobRe(g);

  it("*.sol matches a .sol filename", () => {
    expect(build("*.sol").test("MyContract.sol")).toBe(true);
  });

  it("*.sol does not match .js filename", () => {
    expect(build("*.sol").test("script.js")).toBe(false);
  });

  it(".sol (bare extension) normalises to *.sol", () => {
    expect(build(".sol").test("Token.sol")).toBe(true);
    expect(build(".sol").test("Token.js")).toBe(false);
  });

  it("*.sol is case-insensitive", () => {
    expect(build("*.sol").test("Token.SOL")).toBe(true);
  });

  it("**/*.sol matches nested path segment (full relative path)", () => {
    const re = build("**/*.sol");
    expect(re.test("contracts/ERC20.sol")).toBe(true);
    expect(re.test("contracts/sub/deep/Token.sol")).toBe(true);
    expect(re.test("script.js")).toBe(false);
  });

  it("contracts/*.sol does not match root-level .sol files", () => {
    const re = build("contracts/*.sol");
    expect(re.test("contracts/Token.sol")).toBe(true);
    expect(re.test("Token.sol")).toBe(false);
    expect(re.test("other/Token.sol")).toBe(false);
  });

  it("? matches a single character", () => {
    expect(build("?.sol").test("A.sol")).toBe(true);
    expect(build("?.sol").test("AB.sol")).toBe(false);
  });

  it("exact filename matches only that file", () => {
    expect(build("Foo.sol").test("Foo.sol")).toBe(true);
    expect(build("Foo.sol").test("Bar.sol")).toBe(false);
  });
});

// ── search ──────────────────────────────────────────────────────────────────

describe("FSClient.search()", () => {
  let root: string;
  let fsc: FSClient;

  beforeEach(async () => {
    root = await mkTmpDir();
    fsc  = new FSClient(root, false);
    // Create workspace structure
    await fs.mkdir(path.join(root, "contracts"));
    await fs.writeFile(path.join(root, "contracts", "Token.sol"),
      "// SPDX-License-Identifier: MIT\ncontract Token { uint public totalSupply; }");
    await fs.writeFile(path.join(root, "contracts", "Ownable.sol"),
      "// SPDX-License-Identifier: MIT\nabstract contract Ownable { address owner; }");
    await fs.mkdir(path.join(root, "scripts"));
    await fs.writeFile(path.join(root, "scripts", "deploy.ts"), "const deploy = () => {};");
  });

  afterEach(() => rmDir(root));

  it("finds a literal string across files", async () => {
    const results = await fsc.search("SPDX");
    expect(results.length).toBe(2);
    expect(results.every(r => r.content.includes("SPDX"))).toBe(true);
  });

  it("returns line numbers (1-based)", async () => {
    const results = await fsc.search("totalSupply");
    expect(results.length).toBe(1);
    expect(results[0]!.line).toBe(2);
  });

  it("regex search works", async () => {
    const results = await fsc.search("contract\\s+\\w+", ".", true);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("file_glob '*.sol' restricts to Solidity files", async () => {
    const results = await fsc.search("SPDX", ".", false, "*.sol");
    expect(results.every(r => r.file.endsWith(".sol"))).toBe(true);
    expect(results.length).toBe(2);
  });

  it("file_glob '*.ts' restricts to TypeScript files", async () => {
    const results = await fsc.search("deploy", ".", false, "*.ts");
    expect(results.length).toBe(1);
    expect(results[0]!.file.endsWith(".ts")).toBe(true);
  });

  it("search in a subdirectory only", async () => {
    const results = await fsc.search("contract", "contracts");
    expect(results.every(r => r.file.startsWith("contracts"))).toBe(true);
  });

  it("returns empty array when no match", async () => {
    const results = await fsc.search("xyzzy_not_found");
    expect(results).toEqual([]);
  });
});
