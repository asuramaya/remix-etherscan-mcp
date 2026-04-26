import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { decodeRevert, PANIC_CODES } from "../tools/analysis.js";

// Build a real Error(string) payload via ethers so the test doesn't rely on
// a hard-coded hex that might drift if the ABI encoding ever changes.
function buildErrorPayload(msg: string): string {
  const iface = new ethers.Interface(["function Error(string)"]);
  return iface.encodeFunctionData("Error", [msg]);
}

function buildPanicPayload(code: number): string {
  const iface = new ethers.Interface(["function Panic(uint256)"]);
  return iface.encodeFunctionData("Panic", [code]);
}

// ── empty revert ──────────────────────────────────────────────────────────────

describe("decodeRevert — empty data", () => {
  it("handles 0x", () => {
    const r = decodeRevert("0x");
    expect(r.type).toBe("empty");
    expect(r.message).toMatch(/no data/i);
  });

  it("handles empty string", () => {
    const r = decodeRevert("");
    expect(r.type).toBe("empty");
  });
});

// ── Error(string) ─────────────────────────────────────────────────────────────

describe("decodeRevert — Error(string)", () => {
  it("decodes a simple error message", () => {
    const r = decodeRevert(buildErrorPayload("Ownable: caller is not the owner"));
    expect(r.type).toBe("Error");
    expect(r.message).toBe("Ownable: caller is not the owner");
  });

  it("decodes an empty string message", () => {
    const r = decodeRevert(buildErrorPayload(""));
    expect(r.type).toBe("Error");
    expect(r.message).toBe("");
  });

  it("decodes a message with special characters", () => {
    const msg = "ERC20: transfer amount exceeds balance (≥0)";
    const r   = decodeRevert(buildErrorPayload(msg));
    expect(r.type).toBe("Error");
    expect(r.message).toBe(msg);
  });
});

// ── Panic(uint256) ────────────────────────────────────────────────────────────

describe("decodeRevert — Panic(uint256)", () => {
  it("decodes assertion failure (0x01)", () => {
    const r = decodeRevert(buildPanicPayload(0x01));
    expect(r.type).toBe("Panic");
    expect(r.code).toBe("0x1");
    expect(r.message).toBe(PANIC_CODES[0x01]);
  });

  it("decodes arithmetic overflow (0x11)", () => {
    const r = decodeRevert(buildPanicPayload(0x11));
    expect(r.type).toBe("Panic");
    expect(r.code).toBe("0x11");
    expect(r.message).toMatch(/overflow/i);
  });

  it("decodes array out of bounds (0x32)", () => {
    const r = decodeRevert(buildPanicPayload(0x32));
    expect(r.type).toBe("Panic");
    expect(r.message).toMatch(/array index out of bounds/i);
  });

  it("describes unknown panic code", () => {
    const r = decodeRevert(buildPanicPayload(0xff));
    expect(r.type).toBe("Panic");
    expect(r.message).toMatch(/unknown panic/i);
    expect(r.code).toBe("0xff");
  });
});

// ── custom errors ─────────────────────────────────────────────────────────────

describe("decodeRevert — custom errors", () => {
  const CUSTOM_ABI = [
    { type: "error", name: "Unauthorised",   inputs: [] },
    { type: "error", name: "InsufficientBalance", inputs: [{ name: "available", type: "uint256" }, { name: "required", type: "uint256" }] },
  ];

  function buildCustomPayload(name: string, inputs: Array<{ name: string; type: string }>, values: unknown[]): string {
    const iface = new ethers.Interface(
      inputs.length === 0
        ? [`error ${name}()`]
        : [`error ${name}(${inputs.map(i => `${i.type} ${i.name}`).join(",")})`]
    );
    return iface.encodeErrorResult(name, values);
  }

  it("decodes a no-arg custom error", () => {
    const data = buildCustomPayload("Unauthorised", [], []);
    const r    = decodeRevert(data, CUSTOM_ABI);
    expect(r.type).toBe("custom");
    expect(r.name).toBe("Unauthorised");
    expect(r.args).toEqual({});
  });

  it("decodes a custom error with arguments", () => {
    const data = buildCustomPayload(
      "InsufficientBalance",
      [{ name: "available", type: "uint256" }, { name: "required", type: "uint256" }],
      [100n, 200n],
    );
    const r = decodeRevert(data, CUSTOM_ABI);
    expect(r.type).toBe("custom");
    expect(r.name).toBe("InsufficientBalance");
    expect(r.args!["available"]).toBe("100");
    expect(r.args!["required"]).toBe("200");
  });

  it("falls through to unknown when no ABI provided", () => {
    const data = buildCustomPayload("Unauthorised", [], []);
    const r    = decodeRevert(data); // no ABI
    expect(r.type).toBe("unknown");
    expect(r.selector).toBe(data.slice(0, 10).toLowerCase());
  });

  it("falls through to unknown when selector not in provided ABI", () => {
    const data = buildCustomPayload("Unauthorised", [], []);
    const r    = decodeRevert(data, [{ type: "error", name: "SomeOtherError", inputs: [] }]);
    expect(r.type).toBe("unknown");
  });
});

// ── unknown / raw ─────────────────────────────────────────────────────────────

describe("decodeRevert — unknown selector", () => {
  it("returns unknown type with selector and raw", () => {
    const data = "0xdeadbeef" + "00".repeat(28);
    const r    = decodeRevert(data);
    expect(r.type).toBe("unknown");
    expect(r.selector).toBe("0xdeadbeef");
    expect(r.raw).toBe(data);
  });
});
