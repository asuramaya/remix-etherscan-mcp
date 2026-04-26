import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { chainId } from "./schemas.js";

export function registerGas(server: McpServer, es: EtherscanClient): void {

  // G1 — get_gas_oracle
  server.registerTool("get_gas_oracle", {
    description: "Current gas price tiers (safe/proposed/fast) and EIP-1559 base fee.",
    inputSchema: z.object({ chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("gastracker", "gasoracle", {}, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // G2 — estimate_confirmation_time
  server.registerTool("estimate_confirmation_time", {
    description: "Estimated confirmation time in seconds for a given gas price (in wei).",
    inputSchema: z.object({ gas_price_wei: z.string(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("gastracker", "gasestimate", { gasprice: args.gas_price_wei }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ gas_price_wei: args.gas_price_wei, estimated_seconds: Number(raw) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
