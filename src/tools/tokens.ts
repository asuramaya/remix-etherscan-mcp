import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { address, chainId, pagination, weiToEth } from "./schemas.js";

export function registerTokens(server: McpServer, es: EtherscanClient): void {

  // F1 — get_token_info (PRO)
  server.registerTool("get_token_info", {
    description: "Rich token metadata: name, symbol, supply, type, social links. Requires PRO API key.",
    inputSchema: z.object({ contract_address: address, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("token", "tokeninfo", { contractaddress: args.contract_address }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw[0] ?? raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // F2 — get_token_supply
  server.registerTool("get_token_supply", {
    description: "ERC-20 total supply in raw units and formatted.",
    inputSchema: z.object({ contract_address: address, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("stats", "tokensupply", { contractaddress: args.contract_address }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ contract_address: args.contract_address, total_supply: raw, total_supply_formatted: weiToEth(raw) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // F3 — get_token_balance
  server.registerTool("get_token_balance", {
    description: "ERC-20 balance for a wallet at an optional block.",
    inputSchema: z.object({ address, contract_address: address, tag: z.string().optional(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("account", "tokenbalance", {
        address: args.address, contractaddress: args.contract_address, tag: args.tag ?? "latest",
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, contract_address: args.contract_address, balance: raw, balance_formatted: weiToEth(raw) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // F4 — get_token_balance_history (PRO)
  server.registerTool("get_token_balance_history", {
    description: "ERC-20 balance at a specific block number. Requires PRO API key.",
    inputSchema: z.object({ address, contract_address: address, block_number: z.number().int(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("account", "tokenbalancehistory", {
        address: args.address, contractaddress: args.contract_address, blockno: args.block_number,
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ balance: raw, balance_formatted: weiToEth(raw), block_number: args.block_number }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // F5 — get_token_holder_count
  server.registerTool("get_token_holder_count", {
    description: "Number of unique addresses holding a token.",
    inputSchema: z.object({ contract_address: address, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("token", "tokenholdercount", { contractaddress: args.contract_address }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ contract_address: args.contract_address, holder_count: Number(raw) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // F6 — get_token_holders (PRO)
  server.registerTool("get_token_holders", {
    description: "Paginated list of token holders with balances. Requires PRO API key.",
    inputSchema: z.object({ contract_address: address, ...pagination, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("token", "tokenholderlist", {
        contractaddress: args.contract_address, page: args.page ?? 1, offset: args.offset ?? 100,
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
