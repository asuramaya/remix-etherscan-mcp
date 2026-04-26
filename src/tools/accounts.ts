import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { address, chainId, sortOpt, pagination, blockRange, blockRangeRefine, weiToEth } from "./schemas.js";

export function registerAccounts(server: McpServer, es: EtherscanClient): void {

  // A1 — get_balance
  server.registerTool("get_balance", {
    description: "Get native token (ETH) balance for one or more addresses.",
    inputSchema: z.object({
      addresses: z.union([address, z.array(address).max(20)]),
      chain_id:  chainId,
      tag:       z.string().optional(),
    }),
  }, async (args) => {
    try {
      const addrs  = Array.isArray(args.addresses) ? args.addresses : [args.addresses];
      const action = addrs.length === 1 ? "balance" : "balancemulti";
      const raw    = await es.get<string | { account: string; balance: string }[]>(
        "account", action,
        { address: addrs.join(","), tag: args.tag ?? "latest" },
        args.chain_id
      );
      const result = Array.isArray(raw)
        ? raw.map(r => ({ address: r.account, balance: r.balance, balance_eth: weiToEth(r.balance) }))
        : [{ address: addrs[0]!, balance: raw as string, balance_eth: weiToEth(raw as string) }];
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // A2 — get_balance_history (PRO)
  server.registerTool("get_balance_history", {
    description: "Historical native balance at a specific block number. Requires PRO API key.",
    inputSchema: z.object({ address: address, block_number: z.number().int(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("account", "balancehistory", { address: args.address, blockno: args.block_number }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, block_number: args.block_number, balance: raw, balance_eth: weiToEth(raw) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // A3 — get_transactions
  server.registerTool("get_transactions", {
    description: "Normal (external) transactions for an address.",
    inputSchema: z.object({ address, ...blockRange, ...pagination, sort: sortOpt, chain_id: chainId }).superRefine(blockRangeRefine),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("account", "txlist", {
        address: args.address, startblock: args.start_block ?? 0, endblock: args.end_block,
        page: args.page ?? 1, offset: args.offset ?? 100, sort: args.sort ?? "asc",
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // A4 — get_internal_transactions
  server.registerTool("get_internal_transactions", {
    description: "Internal transactions by address, tx hash, or block range. Supply exactly one of: address / tx_hash / (start_block + end_block).",
    inputSchema: z.object({
      address:     address.optional(),
      tx_hash:     z.string().optional(),
      start_block: z.number().int().nonnegative().optional(),
      end_block:   z.number().int().nonnegative().optional(),
      ...pagination, sort: sortOpt, chain_id: chainId,
    }).superRefine(blockRangeRefine),
  }, async (args) => {
    try {
      let params: Record<string, string | number | undefined>;
      if (args.tx_hash) {
        params = { txhash: args.tx_hash };
      } else if (args.address) {
        params = { address: args.address, startblock: args.start_block ?? 0, endblock: args.end_block, page: args.page ?? 1, offset: args.offset ?? 100, sort: args.sort ?? "asc" };
      } else {
        params = { startblock: args.start_block ?? 0, endblock: args.end_block ?? 99999999, page: args.page ?? 1, offset: args.offset ?? 100, sort: args.sort ?? "asc" };
      }
      const raw = await es.get<object[]>("account", "txlistinternal", params, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // A5 — get_erc20_transfers
  server.registerTool("get_erc20_transfers", {
    description: "ERC-20 token transfer events for an address, optionally filtered by token contract.",
    inputSchema: z.object({
      address, contract_address: address.optional(),
      ...blockRange, ...pagination, sort: sortOpt, chain_id: chainId,
    }).superRefine(blockRangeRefine),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("account", "tokentx", {
        address: args.address, contractaddress: args.contract_address,
        startblock: args.start_block ?? 0, endblock: args.end_block,
        page: args.page ?? 1, offset: args.offset ?? 100, sort: args.sort ?? "asc",
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // A6 — get_erc721_transfers
  server.registerTool("get_erc721_transfers", {
    description: "ERC-721 (NFT) transfer events for an address.",
    inputSchema: z.object({
      address, contract_address: address.optional(),
      ...blockRange, ...pagination, sort: sortOpt, chain_id: chainId,
    }).superRefine(blockRangeRefine),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("account", "tokennfttx", {
        address: args.address, contractaddress: args.contract_address,
        startblock: args.start_block ?? 0, endblock: args.end_block,
        page: args.page ?? 1, offset: args.offset ?? 100, sort: args.sort ?? "asc",
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // A7 — get_erc1155_transfers
  server.registerTool("get_erc1155_transfers", {
    description: "ERC-1155 multi-token transfer events for an address.",
    inputSchema: z.object({
      address, contract_address: address.optional(),
      ...blockRange, ...pagination, sort: sortOpt, chain_id: chainId,
    }).superRefine(blockRangeRefine),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("account", "token1155tx", {
        address: args.address, contractaddress: args.contract_address,
        startblock: args.start_block ?? 0, endblock: args.end_block,
        page: args.page ?? 1, offset: args.offset ?? 100, sort: args.sort ?? "asc",
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // A8 — get_mined_blocks
  server.registerTool("get_mined_blocks", {
    description: "Blocks validated (mined) by an address.",
    inputSchema: z.object({
      address, block_type: z.enum(["blocks", "uncles"]).optional(),
      ...pagination, chain_id: chainId,
    }),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("account", "getminedblocks", {
        address: args.address, blocktype: args.block_type ?? "blocks",
        page: args.page ?? 1, offset: args.offset ?? 100,
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
