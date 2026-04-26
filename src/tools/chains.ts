import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { address, chainId } from "./schemas.js";

interface ChainEntry {
  chainname: string;
  chainid: string;
  blockexplorer: string;
  apiurl: string;
  status: string;
}

export function registerChains(server: McpServer, es: EtherscanClient): void {

  // J1 — get_supported_chains
  server.registerTool("get_supported_chains", {
    description: "All chains supported by Etherscan v2 with their live status.",
    inputSchema: z.object({}),
  }, async () => {
    try {
      const raw = await es.get<ChainEntry[]>("chainlist", "chainlist", {});
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // J2 — get_address_label (PRO Plus)
  server.registerTool("get_address_label", {
    description: "Human-readable nametag, labels, and reputation for any address. Requires PRO Plus API key.",
    inputSchema: z.object({ address, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("account", "getaddresstag", { address: args.address }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
