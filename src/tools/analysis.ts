import { z } from "zod";
import { ethers } from "ethers";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { decodeCalldata, serialise } from "../abi/codec.js";
import { listAbis, getAbi } from "../abi/registry.js";
import { mcpError } from "../errors.js";
import { address, chainId } from "./schemas.js";

// ── well-known revert selectors ───────────────────────────────────────────────
const SEL_ERROR = "0x08c379a0"; // Error(string)
const SEL_PANIC = "0x4e487b71"; // Panic(uint256)

export const PANIC_CODES: Record<number, string> = {
  0x00: "generic compiler panic",
  0x01: "assertion failed",
  0x11: "arithmetic overflow/underflow",
  0x12: "division or modulo by zero",
  0x21: "invalid enum value",
  0x22: "corrupt storage byte array",
  0x31: "pop on empty array",
  0x32: "array index out of bounds",
  0x41: "memory allocation too large",
  0x51: "call to zero-initialised function pointer",
};

// ── storage layout types ──────────────────────────────────────────────────────
interface StorageEntry {
  slot:   string;
  offset: number;
  label:  string;
  type:   string;
}

export interface StorageType {
  encoding:      string;
  label:         string;
  numberOfBytes: string;
}

interface StorageLayout {
  storage: StorageEntry[];
  types:   Record<string, StorageType>;
}

// ── exported pure helpers (tested directly) ───────────────────────────────────

export function decodeSlotValue(hex: string, typeInfo: StorageType, offset: number): unknown {
  const bytes = parseInt(typeInfo.numberOfBytes, 10);
  const full  = hex.startsWith("0x") ? hex.slice(2) : hex;
  // Slot is big-endian 32 bytes; offset is from the right (low bytes)
  const startByte = 64 - (offset + bytes) * 2;
  const slice     = full.slice(Math.max(startByte, 0), startByte + bytes * 2);
  const label     = typeInfo.label.toLowerCase();

  if (label === "bool")    return slice !== "0".repeat(bytes * 2);
  if (label === "address") return "0x" + slice.slice(-40);
  if (label.startsWith("uint")) return BigInt("0x" + (slice || "0")).toString();
  if (label.startsWith("int")) {
    const raw  = BigInt("0x" + (slice || "0"));
    const bits = bytes * 8;
    const max  = 1n << BigInt(bits - 1);
    return (raw >= max ? raw - (1n << BigInt(bits)) : raw).toString();
  }
  if (label.startsWith("bytes")) return "0x" + slice;
  return "0x" + slice;
}

export interface RevertInfo {
  type:      "empty" | "Error" | "Panic" | "custom" | "unknown";
  message?:  string;
  code?:     string;
  name?:     string;
  args?:     Record<string, unknown>;
  selector?: string;
  raw?:      string;
}

export function decodeRevert(data: string, abi?: object[]): RevertInfo {
  if (!data || data === "0x") {
    return { type: "empty", message: "revert with no data" };
  }

  const sel = data.slice(0, 10).toLowerCase();

  if (sel === SEL_ERROR) {
    try {
      const iface   = new ethers.Interface(["function Error(string)"]);
      const decoded = iface.decodeFunctionData("Error", data);
      return { type: "Error", message: decoded[0] as string };
    } catch { /* fall through */ }
  }

  if (sel === SEL_PANIC) {
    try {
      const iface   = new ethers.Interface(["function Panic(uint256)"]);
      const decoded = iface.decodeFunctionData("Panic", data);
      const code    = Number(decoded[0]);
      return {
        type:    "Panic",
        code:    `0x${code.toString(16)}`,
        message: PANIC_CODES[code] ?? `unknown panic code 0x${code.toString(16)}`,
      };
    } catch { /* fall through */ }
  }

  if (abi?.length) {
    try {
      const errorFragments = (abi as Array<Record<string, unknown>>)
        .filter(f => f["type"] === "error")
        .map(f => {
          const inputs = (f["inputs"] as Array<{ name: string; type: string }> | undefined) ?? [];
          const params = inputs.map(i => `${i.type} ${i.name}`.trim()).join(", ");
          return `error ${f["name"] as string}(${params})`;
        });

      if (errorFragments.length > 0) {
        const iface = new ethers.Interface(errorFragments);
        try {
          const err = iface.parseError(data);
          if (err) {
            const argsObj: Record<string, unknown> = {};
            err.fragment.inputs.forEach((inp, i) => {
              argsObj[inp.name || String(i)] = serialise(err.args[i]);
            });
            return { type: "custom", name: err.name, args: argsObj };
          }
        } catch { /* unrecognised selector */ }
      }
    } catch { /* ABI parse error */ }
  }

  return {
    type:     "unknown",
    selector: sel,
    raw:      data,
    message:  "could not decode — pass an ABI containing the error definition",
  };
}

export interface SafeDecodeResult {
  to:             string;
  value:          string;
  data:           string;
  operation:      number;
  operation_name: string;
  safeTxGas:      string;
  baseGas:        string;
  gasPrice:       string;
  gasToken:       string;
  refundReceiver: string;
  signatures:     string;
  inner_decoded?: unknown;
}

const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures) returns (bool)",
];

export function decodeSafeCalldata(calldata: string, innerAbi?: object[]): SafeDecodeResult {
  const iface   = new ethers.Interface(SAFE_ABI);
  const decoded = iface.decodeFunctionData("execTransaction", calldata);

  const result: SafeDecodeResult = {
    to:             decoded[0] as string,
    value:          (decoded[1] as bigint).toString(),
    data:           decoded[2] as string,
    operation:      Number(decoded[3]),
    operation_name: Number(decoded[3]) === 0 ? "CALL" : "DELEGATECALL",
    safeTxGas:      (decoded[4] as bigint).toString(),
    baseGas:        (decoded[5] as bigint).toString(),
    gasPrice:       (decoded[6] as bigint).toString(),
    gasToken:       decoded[7] as string,
    refundReceiver: decoded[8] as string,
    signatures:     decoded[9] as string,
  };

  const innerData = decoded[2] as string;
  if (innerAbi?.length && innerData && innerData !== "0x") {
    const innerDecoded = decodeCalldata(innerAbi, innerData);
    if (innerDecoded) result.inner_decoded = serialise(innerDecoded);
  }

  return result;
}

// ── tool registrations ────────────────────────────────────────────────────────

export function registerAnalysis(server: McpServer, es: EtherscanClient): void {

  // ── P1 — decode_error ───────────────────────────────────────────────────────
  server.registerTool("decode_error", {
    description: "Decode revert data from a failed transaction. Handles Error(string), Panic(uint256), and custom errors from an optional ABI.",
    inputSchema: z.object({
      revert_data: z.string().regex(/^0x[0-9a-fA-F]*$/).describe("Hex-encoded revert data (e.g. from eth_call result)"),
      abi:         z.array(z.record(z.unknown())).optional().describe("ABI containing custom error definitions"),
    }),
  }, async (args) => {
    const result = decodeRevert(args.revert_data, args.abi as object[] | undefined);
    return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
  });

  // ── P2 — decode_storage ─────────────────────────────────────────────────────
  server.registerTool("decode_storage", {
    description: "Read and decode on-chain storage variables using a solc/forge storage layout JSON. Supports inplace scalar types (uint, int, bool, address, bytesN). Mappings require explicit slot computation and are not auto-decoded.",
    inputSchema: z.object({
      contract_address: address,
      chain_id:         chainId,
      layout:           z.object({
        storage: z.array(z.object({
          slot:   z.string(),
          offset: z.number(),
          label:  z.string(),
          type:   z.string(),
        })),
        types: z.record(z.object({
          encoding:      z.string(),
          label:         z.string(),
          numberOfBytes: z.string(),
        })),
      }).describe("Storage layout JSON from `forge inspect <Contract> storageLayout` or solc output"),
      variables: z.array(z.string()).optional().describe("Specific variable names to decode (default: all inplace scalars)"),
    }),
  }, async (args) => {
    try {
      const cid    = args.chain_id ?? 1;
      const layout = args.layout as StorageLayout;

      const wanted = new Set(args.variables ?? layout.storage.map(s => s.label));
      const results: Record<string, unknown> = {};
      const skipped: string[] = [];

      const bySlot = new Map<string, StorageEntry[]>();
      for (const entry of layout.storage) {
        if (!wanted.has(entry.label)) continue;
        const typeInfo = layout.types[entry.type];
        if (!typeInfo || typeInfo.encoding !== "inplace") {
          skipped.push(entry.label);
          continue;
        }
        const arr = bySlot.get(entry.slot) ?? [];
        arr.push(entry);
        bySlot.set(entry.slot, arr);
      }

      for (const [slot, entries] of bySlot) {
        const slotHex = `0x${BigInt(slot).toString(16).padStart(64, "0")}`;
        const raw = await es.get<string>("proxy", "eth_getStorageAt", {
          address:  args.contract_address,
          position: slotHex,
          tag:      "latest",
        }, cid);

        for (const entry of entries) {
          const typeInfo = layout.types[entry.type]!;
          results[entry.label] = decodeSlotValue(raw, typeInfo, entry.offset);
        }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ results, skipped, address: args.contract_address }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // ── P3 — safe_decode ────────────────────────────────────────────────────────
  server.registerTool("safe_decode", {
    description: "Decode Gnosis Safe execTransaction calldata. Returns the inner transaction parameters and, if an ABI is provided, decodes the inner `data` field.",
    inputSchema: z.object({
      calldata:  z.string().regex(/^0x[0-9a-fA-F]*$/).describe("execTransaction calldata hex"),
      inner_abi: z.array(z.record(z.unknown())).optional().describe("ABI for decoding the `data` field of the inner transaction"),
    }),
  }, async (args) => {
    try {
      const result = decodeSafeCalldata(args.calldata, args.inner_abi as object[] | undefined);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("DECODE_ERROR", err)) }], isError: true };
    }
  });

  // ── R1 — abi_list ───────────────────────────────────────────────────────────
  server.registerTool("abi_list", {
    description: "List all built-in well-known ABIs (ERC-20, ERC-721, ERC-1155, WETH, Uniswap V2/V3, Gnosis Safe, Ownable, AccessControl, ERC-4626).",
    inputSchema: z.object({}),
  }, async () => {
    return { content: [{ type: "text" as const, text: JSON.stringify(listAbis(), null, 2) }] };
  });

  // ── R2 — abi_get ────────────────────────────────────────────────────────────
  server.registerTool("abi_get", {
    description: "Retrieve the full ABI for a built-in well-known contract. Use abi_list to see available keys.",
    inputSchema: z.object({
      key: z.string().describe("ABI key from abi_list (e.g. 'erc20', 'uniswap-v2-pair', 'gnosis-safe')"),
    }),
  }, async (args) => {
    const entry = getAbi(args.key);
    if (!entry) {
      return {
        content: [{ type: "text" as const, text: JSON.stringify(mcpError("NOT_FOUND", `Unknown ABI key '${args.key}'. Use abi_list to see available keys.`)) }],
        isError: true,
      };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(entry, null, 2) }] };
  });
}
