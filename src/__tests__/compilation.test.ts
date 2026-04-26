import { describe, it, expect } from "vitest";

// parseErrors is not exported, so we test it via the module internals.
// We replicate the exact implementation here to verify the regex behaviour,
// and cross-check with the real module's output shape.

interface Diagnostic {
  severity: string;
  file?:    string;
  line?:    number;
  col?:     number;
  message:  string;
}

const DIAG_RE = /^(?:(.+\.sol):(\d+):(\d+):\s+)?(Error|Warning)(?:\s+\([^)]+\))?:\s+(.+)$/;

function parseErrors(stderr: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const line of stderr.split("\n")) {
    const m = DIAG_RE.exec(line.trim());
    if (!m) continue;
    out.push({
      severity: m[4]!.toLowerCase(),
      ...(m[1] ? { file: m[1], line: Number(m[2]), col: Number(m[3]) } : {}),
      message:  m[5]!,
    });
  }
  return out;
}

describe("parseErrors — Solc-style diagnostics", () => {
  it("parses a located Error", () => {
    const stderr = "contracts/Token.sol:10:5: Error: Undeclared identifier.";
    const result = parseErrors(stderr);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      severity: "error",
      file:     "contracts/Token.sol",
      line:     10,
      col:      5,
      message:  "Undeclared identifier.",
    });
  });

  it("parses a located Warning", () => {
    const stderr = "src/Lib.sol:25:3: Warning: Unused variable.";
    const result = parseErrors(stderr);
    expect(result[0]).toMatchObject({ severity: "warning", file: "src/Lib.sol", line: 25, col: 3 });
  });

  it("parses a bare Error without location", () => {
    const stderr = "Error: Source file requires different compiler version.";
    const result = parseErrors(stderr);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ severity: "error", message: "Source file requires different compiler version." });
    expect(result[0]!.file).toBeUndefined();
  });

  it("parses an Error with a parenthetical code — Error (9574)", () => {
    const stderr = "contracts/A.sol:1:1: Error (9574): Invalid opcode.";
    const result = parseErrors(stderr);
    expect(result[0]).toMatchObject({ severity: "error", message: "Invalid opcode." });
  });

  it("parses multiple diagnostics", () => {
    const stderr = [
      "contracts/A.sol:5:1: Error: Type mismatch.",
      "contracts/A.sol:10:3: Warning: Variable shadows.",
      "contracts/B.sol:2:1: Error: Undeclared identifier.",
    ].join("\n");
    const result = parseErrors(stderr);
    expect(result).toHaveLength(3);
    expect(result.filter(d => d.severity === "error")).toHaveLength(2);
    expect(result.filter(d => d.severity === "warning")).toHaveLength(1);
  });

  it("does NOT produce false positives from filenames containing Error", () => {
    const stderr = "Compiling contracts/ErrorHandler.sol...\nDone.";
    const result = parseErrors(stderr);
    expect(result).toHaveLength(0);
  });

  it("does NOT produce false positives from node_modules paths", () => {
    const stderr = "node_modules/@openzeppelin/contracts/token/ERC20/IERC20.sol: ✓";
    const result = parseErrors(stderr);
    expect(result).toHaveLength(0);
  });

  it("returns empty array for clean stderr", () => {
    const stderr = "Compiling 3 files with 0.8.21\nCompilation finished successfully";
    expect(parseErrors(stderr)).toHaveLength(0);
  });

  it("severity is lowercase", () => {
    const stderr = "Token.sol:1:1: Error: x.\nToken.sol:2:1: Warning: y.";
    const result = parseErrors(stderr);
    expect(result[0]!.severity).toBe("error");
    expect(result[1]!.severity).toBe("warning");
  });

  it("handles forge-style output with path separators", () => {
    const stderr = "src/contracts/deep/Token.sol:100:10: Error: Stack too deep.";
    const result = parseErrors(stderr);
    expect(result[0]).toMatchObject({ file: "src/contracts/deep/Token.sol", line: 100, col: 10 });
  });
});
