import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { chainId } from "./schemas.js";

export function registerBlocks(server: McpServer, es: EtherscanClient): void {

  // D1 — get_block_by_number
  server.registerTool("get_block_by_number", {
    description: "Full block object by number or tag (latest/earliest/pending).",
    inputSchema: z.object({
      block_number:       z.union([z.number().int().nonnegative(), z.enum(["latest", "earliest", "pending"])]),
      full_transactions:  z.boolean().optional(),
      chain_id:           chainId,
    }),
  }, async (args) => {
    try {
      const tag = typeof args.block_number === "number"
        ? `0x${args.block_number.toString(16)}`
        : args.block_number;
      const raw = await es.get<object>("proxy", "eth_getBlockByNumber", {
        tag,
        boolean: args.full_transactions ? "true" : "false",
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // D2 — get_block_by_timestamp
  server.registerTool("get_block_by_timestamp", {
    description: "Find the closest block number to a Unix timestamp (seconds).",
    inputSchema: z.object({
      timestamp: z.number().int().positive(),
      closest:   z.enum(["before", "after"]).optional(),
      chain_id:  chainId,
    }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("block", "getblocknobytime", {
        timestamp: args.timestamp,
        closest:   args.closest ?? "before",
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ block_number: Number(raw), timestamp: args.timestamp }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // D3 — get_block_rewards
  server.registerTool("get_block_rewards", {
    description: "Miner reward and uncle rewards for a specific block.",
    inputSchema: z.object({ block_number: z.number().int().nonnegative(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("block", "getblockreward", { blockno: args.block_number }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
