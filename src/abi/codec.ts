import { ethers } from "ethers";

export function encodeCall(
  functionSignature: string,
  args: unknown[]
): string {
  const iface = new ethers.Interface([`function ${functionSignature}`]);
  const name  = functionSignature.split("(")[0]!;
  return iface.encodeFunctionData(name, args);
}

export function decodeResult(
  functionSignature: string,
  resultHex: string
): unknown {
  const iface = new ethers.Interface([`function ${functionSignature}`]);
  const name  = functionSignature.split("(")[0]!;
  const decoded = iface.decodeFunctionResult(name, resultHex);
  // Return single value unwrapped, multiple as array
  if (decoded.length === 1) return decoded[0];
  return Array.from(decoded);
}

export function decodeLog(
  abi: object[],
  topics: string[],
  data: string
): { name: string; args: Record<string, unknown> } | null {
  try {
    const iface = new ethers.Interface(abi as ethers.InterfaceAbi);
    const log   = iface.parseLog({ topics, data });
    if (!log) return null;
    const args: Record<string, unknown> = {};
    log.fragment.inputs.forEach((input, i) => {
      const val = log.args[i];
      args[input.name] = typeof val === "bigint" ? val.toString() : val;
    });
    return { name: log.name, args };
  } catch {
    return null;
  }
}

export function decodeCalldata(
  abi: object[],
  calldata: string
): { name: string; args: Record<string, unknown> } | null {
  try {
    const iface    = new ethers.Interface(abi as ethers.InterfaceAbi);
    const decoded  = iface.parseTransaction({ data: calldata });
    if (!decoded) return null;
    const args: Record<string, unknown> = {};
    decoded.fragment.inputs.forEach((input, i) => {
      const val = decoded.args[i];
      args[input.name] = typeof val === "bigint" ? val.toString() : val;
    });
    return { name: decoded.name, args };
  } catch {
    return null;
  }
}

// Serialise bigints for JSON.stringify
export function serialise(val: unknown): unknown {
  if (typeof val === "bigint") return val.toString();
  if (Array.isArray(val))     return val.map(serialise);
  if (val && typeof val === "object") {
    return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, serialise(v)]));
  }
  return val;
}
