import { describe, it, expect } from "vitest";

// Test the git blame --line-porcelain parser logic extracted from git.ts.
// We replicate the parsing algorithm so it can be tested without spawning git.

interface BlameLine {
  line:         number;
  commit:       string;
  author:       string;
  author_email: string;
  timestamp:    number;
  summary:      string;
  content:      string;
}

function parsePorcelain(stdout: string): BlameLine[] {
  const lines: BlameLine[] = [];
  let cur: Partial<BlameLine> = {};

  for (const row of stdout.split("\n")) {
    if (!row) continue;
    const commitMatch = /^([0-9a-f]{40}) \d+ (\d+)/.exec(row);
    if (commitMatch) { cur = { commit: commitMatch[1], line: Number(commitMatch[2]) }; continue; }
    if (row.startsWith("author "))       { cur.author       = row.slice(7).trim();  continue; }
    if (row.startsWith("author-mail "))  { cur.author_email = row.slice(12).trim().replace(/[<>]/g, ""); continue; }
    if (row.startsWith("author-time "))  { cur.timestamp    = Number(row.slice(12)); continue; }
    if (row.startsWith("summary "))      { cur.summary      = row.slice(8).trim();  continue; }
    if (row.startsWith("\t")) {
      lines.push({
        line:         cur.line         ?? 0,
        commit:       cur.commit       ?? "",
        author:       cur.author       ?? "",
        author_email: cur.author_email ?? "",
        timestamp:    cur.timestamp    ?? 0,
        summary:      cur.summary      ?? "",
        content:      row.slice(1),
      });
      cur = {};
    }
  }
  return lines;
}

// ── porcelain parsing ──────────────────────────────────────────────────────

describe("git blame --line-porcelain parser", () => {
  const HASH_A = "a".repeat(40);
  const HASH_B = "b".repeat(40);

  const SAMPLE_PORCELAIN = [
    `${HASH_A} 1 1 1`,
    "author Alice Smith",
    "author-mail <alice@example.com>",
    "author-time 1700000000",
    "author-tz +0000",
    "committer Alice Smith",
    "committer-mail <alice@example.com>",
    "committer-time 1700000000",
    "committer-tz +0000",
    "summary Initial commit",
    "filename contracts/Token.sol",
    "\tpragma solidity ^0.8.0;",
    `${HASH_B} 2 2 1`,
    "author Bob Jones",
    "author-mail <bob@example.com>",
    "author-time 1700001000",
    "author-tz +0000",
    "committer Bob Jones",
    "committer-mail <bob@example.com>",
    "committer-time 1700001000",
    "committer-tz +0000",
    "summary Add ERC20 transfer",
    "filename contracts/Token.sol",
    "\tcontract Token {",
  ].join("\n");

  it("parses two lines correctly", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    expect(result).toHaveLength(2);
  });

  it("extracts commit hash", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    expect(result[0]!.commit).toBe(HASH_A);
    expect(result[1]!.commit).toBe(HASH_B);
  });

  it("extracts author name", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    expect(result[0]!.author).toBe("Alice Smith");
    expect(result[1]!.author).toBe("Bob Jones");
  });

  it("strips angle brackets from author-mail", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    expect(result[0]!.author_email).toBe("alice@example.com");
    expect(result[1]!.author_email).toBe("bob@example.com");
  });

  it("extracts unix timestamp", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    expect(result[0]!.timestamp).toBe(1700000000);
    expect(result[1]!.timestamp).toBe(1700001000);
  });

  it("extracts commit summary", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    expect(result[0]!.summary).toBe("Initial commit");
    expect(result[1]!.summary).toBe("Add ERC20 transfer");
  });

  it("strips the leading tab from line content", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    expect(result[0]!.content).toBe("pragma solidity ^0.8.0;");
    expect(result[1]!.content).toBe("contract Token {");
  });

  it("extracts 1-based line numbers", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    expect(result[0]!.line).toBe(1);
    expect(result[1]!.line).toBe(2);
  });

  it("handles empty input gracefully", () => {
    expect(parsePorcelain("")).toHaveLength(0);
  });

  it("handles content with tabs preserved after the first", () => {
    const input = [
      "abc1234567890123456789012345678901234567890 1 1 1",
      "author Dev",
      "author-mail <d@example.com>",
      "author-time 0",
      "summary fix",
      "filename f.sol",
      "\t\tindented code",
    ].join("\n");
    const result = parsePorcelain(input);
    expect(result[0]!.content).toBe("\tindented code");
  });

  it("resets state between blame entries", () => {
    const result = parsePorcelain(SAMPLE_PORCELAIN);
    // Each line should have its own author, not carry over
    expect(result[0]!.author).not.toBe(result[1]!.author);
  });

  it("handles multiple lines from same commit (shared header)", () => {
    // In git porcelain output, subsequent lines from the same commit
    // omit most headers and only repeat the commit hash line
    const shared = [
      `${HASH_A} 1 1 2`,
      "author Shared Author",
      "author-mail <shared@example.com>",
      "author-time 1000",
      "summary Shared commit",
      "filename f.sol",
      "\tline one",
      `${HASH_A} 2 2`,
      `previous ${"0".repeat(40)} f.sol`,
      "filename f.sol",
      "\tline two",
    ].join("\n");
    const result = parsePorcelain(shared);
    // First line should have full metadata
    expect(result[0]!.commit).toBe(HASH_A);
    expect(result[0]!.content).toBe("line one");
    // Second line has same commit, content is extracted correctly
    expect(result[1]!.content).toBe("line two");
  });
});
