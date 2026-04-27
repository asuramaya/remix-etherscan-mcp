import { z } from "zod";
import type { McpServer }      from "@modelcontextprotocol/sdk/server/mcp.js";
import type { JsonRpcClient }  from "../rpc/client.js";
import { mcpError } from "../errors.js";
import { serialise } from "../abi/codec.js";
import { txHash, address, chainId } from "./schemas.js";

function requireRpc(client: JsonRpcClient | null): JsonRpcClient {
  if (!client) throw new Error("RPC_URL is not configured. Set the RPC_URL environment variable to an Alchemy, Infura, or public JSON-RPC endpoint.");
  return client;
}

// Tracers supported by Geth-compatible nodes and Alchemy/Infura
const TRACERS = ["callTracer", "prestateTracer", "4byteTracer", "structTracer"] as const;

export function registerRpc(server: McpServer, rpcClient: JsonRpcClient | null): void {

  // Q1 — debug_trace_transaction
  server.registerTool("debug_trace_transaction", {
    description: "Full EVM execution trace for a transaction. Uses debug_traceTransaction with callTracer (compact call tree) by default. Requires RPC_URL to be configured — Etherscan does not expose trace APIs.",
    inputSchema: z.object({
      tx_hash:        txHash,
      tracer:         z.enum(TRACERS).optional().describe("Tracer to use (default: callTracer). callTracer = compact call tree; prestateTracer = all touched accounts/storage; 4byteTracer = selector + call counts; structTracer = raw opcode-level trace (very verbose)."),
      disable_stack:  z.boolean().optional().describe("Omit stack from structTracer output (default: true — reduces size)"),
      disable_memory: z.boolean().optional().describe("Omit memory from structTracer output (default: true)"),
      disable_return_data: z.boolean().optional().describe("Omit returnData from structTracer output (default: false)"),
      timeout:        z.string().optional().describe("Trace timeout, e.g. '30s' (default: node default, usually 5s)"),
    }),
  }, async (args) => {
    try {
      const rpc    = requireRpc(rpcClient);
      const tracer = args.tracer ?? "callTracer";

      const tracerConfig: Record<string, unknown> = { tracer };
      if (tracer === "structTracer" || !args.tracer) {
        tracerConfig["tracerConfig"] = {
          disableStack:      args.disable_stack      ?? true,
          disableMemory:     args.disable_memory     ?? true,
          disableReturnData: args.disable_return_data ?? false,
        };
      }
      if (args.timeout) tracerConfig["timeout"] = args.timeout;

      const result = await rpc.call<unknown>("debug_traceTransaction", [args.tx_hash, tracerConfig]);
      return { content: [{ type: "text" as const, text: JSON.stringify(serialise(result), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // Q2 — trace_call
  server.registerTool("trace_call", {
    description: "Trace a hypothetical call at a specific block without broadcasting a transaction. Uses debug_traceCall. Ideal for pre-flight analysis: 'what would happen if address X called function Y at block Z?'",
    inputSchema: z.object({
      to:           address.describe("Target contract address"),
      data:         z.string().regex(/^0x[0-9a-fA-F]*$/).optional().describe("Calldata hex (use call_contract to encode from a signature)"),
      from:         address.optional().describe("Simulated sender (msg.sender)"),
      value:        z.string().optional().describe("ETH value in wei (hex or decimal)"),
      block_tag:    z.string().optional().describe("Block tag or number (default: latest)"),
      tracer:       z.enum(TRACERS).optional().describe("Tracer (default: callTracer)"),
    }),
  }, async (args) => {
    try {
      const rpc = requireRpc(rpcClient);

      const callObj: Record<string, string> = { to: args.to, data: args.data ?? "0x" };
      if (args.from)  callObj["from"]  = args.from;
      if (args.value) callObj["value"] = args.value.startsWith("0x") ? args.value : `0x${BigInt(args.value).toString(16)}`;

      const tracerConfig = { tracer: args.tracer ?? "callTracer" };
      const result = await rpc.call<unknown>("debug_traceCall", [callObj, args.block_tag ?? "latest", tracerConfig]);
      return { content: [{ type: "text" as const, text: JSON.stringify(serialise(result), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // Q3 — eth_get_proof
  server.registerTool("eth_get_proof", {
    description: "Generate a Merkle-Patricia proof for an account's balance/nonce/code and optionally specific storage slots. Useful for light-client verification and cross-chain bridge validation.",
    inputSchema: z.object({
      address:       address,
      storage_keys:  z.array(z.string().regex(/^0x[0-9a-fA-F]{1,64}$/)).optional().describe("Storage slot positions to include in the proof (hex strings)"),
      block_tag:     z.string().optional().describe("Block tag or hex block number (default: latest)"),
    }),
  }, async (args) => {
    try {
      const rpc  = requireRpc(rpcClient);
      const keys = (args.storage_keys ?? []).map(k => k.startsWith("0x") ? k : `0x${k}`);
      const result = await rpc.call<unknown>("eth_getProof", [args.address, keys, args.block_tag ?? "latest"]);
      return { content: [{ type: "text" as const, text: JSON.stringify(serialise(result), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // Q4 — rpc_call
  server.registerTool("rpc_call", {
    description: "Raw JSON-RPC passthrough to the configured RPC_URL endpoint. Use for any method not covered by dedicated tools (e.g. net_version, txpool_content, engine_ methods). Requires RPC_URL.",
    inputSchema: z.object({
      method: z.string().describe("JSON-RPC method name (e.g. 'net_version', 'txpool_content')"),
      params: z.array(z.unknown()).optional().describe("Method parameters array"),
    }),
  }, async (args) => {
    try {
      const rpc    = requireRpc(rpcClient);
      const result = await rpc.call<unknown>(args.method, (args.params ?? []) as unknown[]);
      return { content: [{ type: "text" as const, text: JSON.stringify(serialise(result), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });
}
