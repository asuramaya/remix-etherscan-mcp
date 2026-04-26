import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { decodeSafeCalldata } from "../tools/analysis.js";

const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)",
];

function buildExecTx(overrides: Partial<{
  to:             string;
  value:          bigint;
  data:           string;
  operation:      number;
  safeTxGas:      bigint;
  baseGas:        bigint;
  gasPrice:       bigint;
  gasToken:       string;
  refundReceiver: string;
  signatures:     string;
}>): string {
  const ZERO_ADDR = "0x" + "0".repeat(40);
  const iface     = new ethers.Interface(SAFE_ABI);
  return iface.encodeFunctionData("execTransaction", [
    overrides.to             ?? ZERO_ADDR,
    overrides.value          ?? 0n,
    overrides.data           ?? "0x",
    overrides.operation      ?? 0,
    overrides.safeTxGas      ?? 0n,
    overrides.baseGas        ?? 0n,
    overrides.gasPrice       ?? 0n,
    overrides.gasToken       ?? ZERO_ADDR,
    overrides.refundReceiver ?? ZERO_ADDR,
    overrides.signatures     ?? "0x",
  ]);
}

describe("decodeSafeCalldata — basic fields", () => {
  it("decodes `to` address", () => {
    const to  = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
    const r   = decodeSafeCalldata(buildExecTx({ to }));
    expect(r.to.toLowerCase()).toBe(to.toLowerCase());
  });

  it("decodes `value` as decimal string", () => {
    const r = decodeSafeCalldata(buildExecTx({ value: 1_000_000_000_000_000_000n }));
    expect(r.value).toBe("1000000000000000000");
  });

  it("decodes zero value", () => {
    const r = decodeSafeCalldata(buildExecTx({ value: 0n }));
    expect(r.value).toBe("0");
  });

  it("decodes CALL operation (0)", () => {
    const r = decodeSafeCalldata(buildExecTx({ operation: 0 }));
    expect(r.operation).toBe(0);
    expect(r.operation_name).toBe("CALL");
  });

  it("decodes DELEGATECALL operation (1)", () => {
    const r = decodeSafeCalldata(buildExecTx({ operation: 1 }));
    expect(r.operation).toBe(1);
    expect(r.operation_name).toBe("DELEGATECALL");
  });

  it("decodes safeTxGas and baseGas", () => {
    const r = decodeSafeCalldata(buildExecTx({ safeTxGas: 50_000n, baseGas: 10_000n }));
    expect(r.safeTxGas).toBe("50000");
    expect(r.baseGas).toBe("10000");
  });

  it("decodes inner data bytes passthrough", () => {
    const innerData = "0xdeadbeef";
    const r = decodeSafeCalldata(buildExecTx({ data: innerData }));
    expect(r.data).toBe(innerData);
  });
});

describe("decodeSafeCalldata — inner ABI decoding", () => {
  const ERC20_ABI = [
    { type: "function", name: "transfer", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }] },
  ];

  it("decodes inner transfer calldata when inner_abi is provided", () => {
    const recipient = "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B";
    const amount    = 500n;
    const erc20If   = new ethers.Interface(ERC20_ABI as ethers.InterfaceAbi);
    const innerData = erc20If.encodeFunctionData("transfer", [recipient, amount]);

    const r = decodeSafeCalldata(buildExecTx({ data: innerData }), ERC20_ABI);
    expect(r.inner_decoded).toBeDefined();
    const decoded = r.inner_decoded as { name: string; args: Record<string, unknown> };
    expect(decoded.name).toBe("transfer");
    expect(decoded.args["amount"]).toBe("500");
  });

  it("leaves inner_decoded undefined when no inner_abi", () => {
    const r = decodeSafeCalldata(buildExecTx({ data: "0xabcdef01" }));
    expect(r.inner_decoded).toBeUndefined();
  });

  it("leaves inner_decoded undefined when inner data is 0x", () => {
    const r = decodeSafeCalldata(buildExecTx({ data: "0x" }), ERC20_ABI);
    expect(r.inner_decoded).toBeUndefined();
  });
});

describe("decodeSafeCalldata — error handling", () => {
  it("throws on non-execTransaction calldata", () => {
    expect(() => decodeSafeCalldata("0xdeadbeef")).toThrow();
  });

  it("throws on empty calldata", () => {
    expect(() => decodeSafeCalldata("0x")).toThrow();
  });
});
