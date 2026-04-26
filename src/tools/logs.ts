import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { address, chainId, pagination } from "./schemas.js";

const blockOrTag = z.union([z.number().int().nonnegative(), z.enum(["latest"])]);

export function registerLogs(server: McpServer, es: EtherscanClient): void {

  // E1 — get_logs_by_address
  server.registerTool("get_logs_by_address", {
    description: "Event logs emitted by a specific contract, paginated.",
    inputSchema: z.object({
      address,
      from_block: blockOrTag,
      to_block:   blockOrTag,
      ...pagination,
      chain_id:   chainId,
    }).superRefine((d, ctx) => {
      if (typeof d.from_block === "number" && typeof d.to_block === "number" && d.from_block > d.to_block) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from_block must be ≤ to_block", path: ["from_block"] });
      }
    }),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("logs", "getLogs", {
        address:   args.address,
        fromBlock: args.from_block,
        toBlock:   args.to_block,
        page:      args.page ?? 1,
        offset:    args.offset ?? 1000,
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // E2 — get_logs_by_topics
  server.registerTool("get_logs_by_topics", {
    description: "Event logs filtered by up to 4 topic hashes with boolean (and/or) operators.",
    inputSchema: z.object({
      from_block:    z.number().int().nonnegative(),
      to_block:      z.number().int().nonnegative(),
      topic0:        z.string(),
      topic1:        z.string().optional(),
      topic2:        z.string().optional(),
      topic3:        z.string().optional(),
      topic0_1_opr:  z.enum(["and", "or"]).optional(),
      topic0_2_opr:  z.enum(["and", "or"]).optional(),
      topic0_3_opr:  z.enum(["and", "or"]).optional(),
      topic1_2_opr:  z.enum(["and", "or"]).optional(),
      topic1_3_opr:  z.enum(["and", "or"]).optional(),
      topic2_3_opr:  z.enum(["and", "or"]).optional(),
      address:       address.optional(),
      ...pagination,
      chain_id:      chainId,
    }).superRefine((d, ctx) => {
      if (d.from_block > d.to_block) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "from_block must be ≤ to_block", path: ["from_block"] });
    }),
  }, async (args) => {
    try {
      const params: Record<string, string | number | undefined> = {
        fromBlock: args.from_block,
        toBlock:   args.to_block,
        topic0:    args.topic0,
        topic1:    args.topic1,
        topic2:    args.topic2,
        topic3:    args.topic3,
        topic0_1_opr: args.topic0_1_opr,
        topic0_2_opr: args.topic0_2_opr,
        topic0_3_opr: args.topic0_3_opr,
        topic1_2_opr: args.topic1_2_opr,
        topic1_3_opr: args.topic1_3_opr,
        topic2_3_opr: args.topic2_3_opr,
        address:   args.address,
        page:      args.page ?? 1,
        offset:    args.offset ?? 1000,
      };
      const raw = await es.get<object[]>("logs", "getLogs", params, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
