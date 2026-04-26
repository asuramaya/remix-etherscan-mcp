import { describe, it, expect } from "vitest";
import { z } from "zod";
import { blockRangeRefine, blockRange, address, txHash, pagination } from "../tools/schemas.js";

// ── blockRangeRefine ────────────────────────────────────────────────────────

describe("blockRangeRefine", () => {
  const schema = z.object({ ...blockRange }).superRefine(blockRangeRefine);

  it("passes when both are undefined", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("passes when only start_block is set", () => {
    expect(schema.safeParse({ start_block: 100 }).success).toBe(true);
  });

  it("passes when only end_block is set", () => {
    expect(schema.safeParse({ end_block: 200 }).success).toBe(true);
  });

  it("passes when start_block === end_block", () => {
    expect(schema.safeParse({ start_block: 50, end_block: 50 }).success).toBe(true);
  });

  it("passes when start_block < end_block", () => {
    expect(schema.safeParse({ start_block: 0, end_block: 1_000_000 }).success).toBe(true);
  });

  it("fails when start_block > end_block", () => {
    const result = schema.safeParse({ start_block: 500, end_block: 100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/start_block must be/i);
      expect(result.error.issues[0]!.path).toContain("start_block");
    }
  });

  it("rejects negative start_block", () => {
    expect(schema.safeParse({ start_block: -1 }).success).toBe(false);
  });
});

// ── address schema ──────────────────────────────────────────────────────────

describe("address schema", () => {
  it("accepts 0x-prefixed lowercase hex address", () => {
    expect(address.safeParse("0xd8da6bf26964af9d7eed9e03e53415d37aa96045").success).toBe(true);
  });

  it("accepts checksummed address", () => {
    expect(address.safeParse("0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045").success).toBe(true);
  });

  it("rejects address without 0x prefix", () => {
    expect(address.safeParse("d8da6bf26964af9d7eed9e03e53415d37aa96045").success).toBe(false);
  });

  it("rejects too-short address", () => {
    expect(address.safeParse("0xdeadbeef").success).toBe(false);
  });

  it("rejects too-long address", () => {
    expect(address.safeParse("0x" + "a".repeat(41)).success).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(address.safeParse("0x" + "g".repeat(40)).success).toBe(false);
  });
});

// ── txHash schema ───────────────────────────────────────────────────────────

describe("txHash schema", () => {
  const validHash = "0x" + "a".repeat(64);

  it("accepts a valid 32-byte hex hash", () => {
    expect(txHash.safeParse(validHash).success).toBe(true);
  });

  it("rejects hash without 0x prefix", () => {
    expect(txHash.safeParse("a".repeat(64)).success).toBe(false);
  });

  it("rejects hash that is too short", () => {
    expect(txHash.safeParse("0x" + "a".repeat(63)).success).toBe(false);
  });

  it("rejects hash that is too long", () => {
    expect(txHash.safeParse("0x" + "a".repeat(65)).success).toBe(false);
  });
});

// ── pagination schema ───────────────────────────────────────────────────────

describe("pagination schema", () => {
  const schema = z.object({ ...pagination });

  it("accepts page=1, offset=100", () => {
    expect(schema.safeParse({ page: 1, offset: 100 }).success).toBe(true);
  });

  it("accepts empty object (all optional)", () => {
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("rejects page=0 (must be positive)", () => {
    expect(schema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("rejects offset=0 (must be positive)", () => {
    expect(schema.safeParse({ offset: 0 }).success).toBe(false);
  });

  it("rejects offset > 10000", () => {
    expect(schema.safeParse({ offset: 10001 }).success).toBe(false);
  });
});

// ── Tool-level blockRange integration ──────────────────────────────────────

describe("blockRange validation on account tool schemas", () => {
  // We import the schema shapes indirectly by re-constructing the same
  // z.object({ ...blockRange }).superRefine(blockRangeRefine) pattern used
  // in every account tool. This verifies the pattern is correct.

  const txSchema = z.object({
    address,
    ...blockRange,
    ...pagination,
    chain_id: z.number().int().positive().optional(),
  }).superRefine(blockRangeRefine);

  it("get_transactions shape: valid range accepted", () => {
    expect(txSchema.safeParse({
      address: "0x" + "a".repeat(40),
      start_block: 1000,
      end_block: 2000,
    }).success).toBe(true);
  });

  it("get_transactions shape: inverted range rejected", () => {
    const result = txSchema.safeParse({
      address: "0x" + "a".repeat(40),
      start_block: 9000,
      end_block: 1000,
    });
    expect(result.success).toBe(false);
  });
});

// ── from_block / to_block on log tools ─────────────────────────────────────

describe("from_block / to_block validation (logs)", () => {
  const logSchema = z.object({
    address,
    from_block: z.union([z.number().int().nonnegative(), z.enum(["latest"])]),
    to_block:   z.union([z.number().int().nonnegative(), z.enum(["latest"])]),
  }).superRefine((d, ctx) => {
    if (typeof d.from_block === "number" && typeof d.to_block === "number" && d.from_block > d.to_block) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from_block must be ≤ to_block", path: ["from_block"] });
    }
  });

  it("passes when from_block < to_block", () => {
    expect(logSchema.safeParse({ address: "0x" + "a".repeat(40), from_block: 100, to_block: 200 }).success).toBe(true);
  });

  it("passes when from_block is 'latest'", () => {
    expect(logSchema.safeParse({ address: "0x" + "a".repeat(40), from_block: "latest", to_block: "latest" }).success).toBe(true);
  });

  it("fails when from_block > to_block", () => {
    const result = logSchema.safeParse({ address: "0x" + "a".repeat(40), from_block: 500, to_block: 100 });
    expect(result.success).toBe(false);
  });
});

// ── git_blame start_line / end_line validation ───────────────────────────────

describe("git_blame line range validation", () => {
  const blameSchema = z.object({
    file:       z.string(),
    start_line: z.number().int().positive().optional(),
    end_line:   z.number().int().positive().optional(),
  }).superRefine((d, ctx) => {
    if (d.start_line !== undefined && d.end_line !== undefined && d.start_line > d.end_line) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "start_line must be ≤ end_line", path: ["start_line"] });
    }
  });

  it("passes when start_line < end_line", () => {
    expect(blameSchema.safeParse({ file: "foo.sol", start_line: 1, end_line: 50 }).success).toBe(true);
  });

  it("passes when both omitted", () => {
    expect(blameSchema.safeParse({ file: "foo.sol" }).success).toBe(true);
  });

  it("fails when start_line > end_line", () => {
    const result = blameSchema.safeParse({ file: "foo.sol", start_line: 100, end_line: 10 });
    expect(result.success).toBe(false);
  });

  it("rejects start_line=0 (must be positive)", () => {
    expect(blameSchema.safeParse({ file: "foo.sol", start_line: 0 }).success).toBe(false);
  });
});
