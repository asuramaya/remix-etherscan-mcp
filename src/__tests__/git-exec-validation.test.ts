import { describe, it, expect } from "vitest";
import { z } from "zod";

// Reproduce the exact validation logic from git.ts so we can test
// the security-critical schema without spawning git.

const GIT_CMD_RE = /^git[ \t][^\n\r&|;><`$(){}[\]]*$/;
const DANGEROUS_FLAGS = [
  "--upload-pack", "--receive-pack", "--exec",
  "--local-port", "--proxy-command",
];

const gitCommandSchema = z.string()
  .regex(GIT_CMD_RE, "Only bare git commands allowed. No shell operators or newlines.")
  .refine(
    (cmd) => !DANGEROUS_FLAGS.some(f => cmd.includes(f)),
    "Command contains a dangerous flag that could execute arbitrary code.",
  );

describe("git_exec command validation", () => {

  // ── Valid commands ────────────────────────────────────────────────────────

  it("accepts: git log", () => {
    expect(gitCommandSchema.safeParse("git log").success).toBe(true);
  });

  it("accepts: git log --oneline -20", () => {
    expect(gitCommandSchema.safeParse("git log --oneline -20").success).toBe(true);
  });

  it("accepts: git status", () => {
    expect(gitCommandSchema.safeParse("git status").success).toBe(true);
  });

  it("accepts: git diff HEAD~1", () => {
    expect(gitCommandSchema.safeParse("git diff HEAD~1").success).toBe(true);
  });

  it("accepts: git show --stat", () => {
    expect(gitCommandSchema.safeParse("git show --stat").success).toBe(true);
  });

  it("accepts tab-separated: git\tlog", () => {
    expect(gitCommandSchema.safeParse("git\tlog").success).toBe(true);
  });

  // ── Missing/wrong prefix ──────────────────────────────────────────────────

  it("rejects: no git prefix", () => {
    expect(gitCommandSchema.safeParse("ls -la").success).toBe(false);
  });

  it("rejects: git without subcommand", () => {
    expect(gitCommandSchema.safeParse("git").success).toBe(false);
  });

  // ── Shell injection attempts ──────────────────────────────────────────────

  it("rejects: semicolon injection", () => {
    expect(gitCommandSchema.safeParse("git log; rm -rf /").success).toBe(false);
  });

  it("rejects: pipe injection", () => {
    expect(gitCommandSchema.safeParse("git log | cat /etc/passwd").success).toBe(false);
  });

  it("rejects: && chaining", () => {
    expect(gitCommandSchema.safeParse("git status && evil").success).toBe(false);
  });

  it("rejects: output redirect", () => {
    expect(gitCommandSchema.safeParse("git log > /tmp/out").success).toBe(false);
  });

  it("rejects: input redirect", () => {
    expect(gitCommandSchema.safeParse("git log < /tmp/in").success).toBe(false);
  });

  it("rejects: backtick substitution", () => {
    expect(gitCommandSchema.safeParse("git log `id`").success).toBe(false);
  });

  it("rejects: $() substitution", () => {
    expect(gitCommandSchema.safeParse("git log $(id)").success).toBe(false);
  });

  it("rejects: newline injection", () => {
    // Previously possible with JS ^ anchor not blocking \n
    expect(gitCommandSchema.safeParse("git log\nrm -rf /").success).toBe(false);
  });

  it("rejects: carriage-return injection", () => {
    expect(gitCommandSchema.safeParse("git log\rrm -rf /").success).toBe(false);
  });

  it("rejects: curly brace expansion", () => {
    expect(gitCommandSchema.safeParse("git {log,status}").success).toBe(false);
  });

  // ── Dangerous flags ───────────────────────────────────────────────────────

  it("rejects: --upload-pack (arbitrary binary execution)", () => {
    expect(gitCommandSchema.safeParse("git clone --upload-pack /bin/sh repo").success).toBe(false);
  });

  it("rejects: --receive-pack", () => {
    expect(gitCommandSchema.safeParse("git push --receive-pack /bin/sh").success).toBe(false);
  });

  it("rejects: --exec", () => {
    expect(gitCommandSchema.safeParse("git submodule --exec cmd").success).toBe(false);
  });

  it("rejects: --proxy-command", () => {
    expect(gitCommandSchema.safeParse("git fetch --proxy-command evil").success).toBe(false);
  });

  it("rejects: --local-port", () => {
    expect(gitCommandSchema.safeParse("git daemon --local-port 1234").success).toBe(false);
  });
});
