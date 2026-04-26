import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { chainId, weiToEth } from "./schemas.js";

const dateRange = {
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
  end_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format: YYYY-MM-DD"),
};
const sortOpt = z.enum(["asc", "desc"]).optional();

export function registerStats(server: McpServer, es: EtherscanClient): void {

  // H1 — get_eth_price
  server.registerTool("get_eth_price", {
    description: "Current ETH price in USD and BTC.",
    inputSchema: z.object({ chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("stats", "ethprice", {}, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // H2 — get_eth_price_history (PRO)
  server.registerTool("get_eth_price_history", {
    description: "Daily ETH price in USD over a date range. Requires PRO API key.",
    inputSchema: z.object({ ...dateRange, sort: sortOpt, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("stats", "ethdailyprice", { startdate: args.start_date, enddate: args.end_date, sort: args.sort ?? "asc" }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // H3 — get_eth_supply
  server.registerTool("get_eth_supply", {
    description: "Total circulating ETH supply.",
    inputSchema: z.object({ chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("stats", "ethsupply", {}, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ supply_wei: raw, supply_eth: weiToEth(raw) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // H4 — get_eth_supply_v2
  server.registerTool("get_eth_supply_v2", {
    description: "ETH supply breakdown: circulating, staked, burned, withdrawals.",
    inputSchema: z.object({ chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("stats", "ethsupply2", {}, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // H5–H12: PRO daily stats — all share the same dateRange + sort + chain_id shape
  const dailyStats: Array<[string, string, string, string]> = [
    ["get_daily_tx_count",     "dailytx",           "Daily transaction count. Requires PRO.",           "tx_count"],
    ["get_daily_gas_used",     "dailygasused",       "Daily total gas consumed. Requires PRO.",          "gas_used"],
    ["get_daily_avg_gas_price","dailyavggasprice",   "Daily min/avg/max gas price in wei. Requires PRO.", "gas_price"],
    ["get_daily_block_count",  "dailyblkcount",      "Daily block count and total rewards. Requires PRO.", "block_count"],
    ["get_daily_block_size",   "dailyavgblocksize",  "Daily average block size in bytes. Requires PRO.", "block_size"],
    ["get_daily_block_time",   "dailyavgblocktime",  "Daily average block time in seconds. Requires PRO.", "block_time"],
    ["get_daily_block_rewards","dailyblockrewards",  "Daily block rewards in ETH. Requires PRO.",        "block_rewards"],
    ["get_daily_tx_fees",      "dailytxnfee",        "Daily total transaction fees in ETH. Requires PRO.", "tx_fees"],
  ];

  for (const [toolName, action, description] of dailyStats) {
    server.registerTool(toolName, {
      description,
      inputSchema: z.object({ ...dateRange, sort: sortOpt, chain_id: chainId }),
    }, async (args) => {
      try {
        const raw = await es.get<object[]>("stats", action, { startdate: args.start_date, enddate: args.end_date, sort: args.sort ?? "asc" }, args.chain_id);
        return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
      }
    });
  }

  // H — get_node_count
  server.registerTool("get_node_count", {
    description: "Total discoverable Ethereum nodes.",
    inputSchema: z.object({ chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("stats", "nodecount", {}, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // H — get_chain_size (PRO)
  server.registerTool("get_chain_size", {
    description: "Blockchain size by date/client/sync mode. Requires PRO.",
    inputSchema: z.object({
      start_date:  z.string().optional(),
      end_date:    z.string().optional(),
      client_type: z.enum(["geth", "parity"]).optional(),
      sync_mode:   z.enum(["default", "archive"]).optional(),
      sort:        sortOpt,
      chain_id:    chainId,
    }),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("stats", "chainsize", {
        startdate: args.start_date, enddate: args.end_date,
        clienttype: args.client_type, syncmode: args.sync_mode, sort: args.sort ?? "asc",
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
