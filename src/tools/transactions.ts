import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { txHash, chainId } from "./schemas.js";

interface RpcLog {
  address:          string;
  topics:           string[];
  data:             string;
  blockNumber:      string;
  transactionHash:  string;
  logIndex:         string;
  removed?:         boolean;
}

export function registerTransactions(server: McpServer, es: EtherscanClient): void {

  // C1 — get_transaction
  server.registerTool("get_transaction", {
    description: "Full transaction object by hash.",
    inputSchema: z.object({ tx_hash: txHash, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("proxy", "eth_getTransactionByHash", { txhash: args.tx_hash }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // C2 — get_transaction_receipt
  server.registerTool("get_transaction_receipt", {
    description: "Transaction receipt: status, logs, gas used, and contract address if deployment.",
    inputSchema: z.object({ tx_hash: txHash, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("proxy", "eth_getTransactionReceipt", { txhash: args.tx_hash }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // C2b — get_tx_logs
  server.registerTool("get_tx_logs", {
    description: "All event logs emitted by a transaction, across every contract. Optionally decode with a provided ABI fragment array.",
    inputSchema: z.object({
      tx_hash:  txHash,
      chain_id: chainId,
      abi:      z.array(z.record(z.unknown())).optional().describe("ABI fragment array for decoding. If omitted, raw logs are returned."),
    }),
  }, async (args) => {
    try {
      const receipt = await es.get<{ logs?: RpcLog[]; status?: string }>(
        "proxy", "eth_getTransactionReceipt", { txhash: args.tx_hash }, args.chain_id,
      );
      const logs: RpcLog[] = receipt?.logs ?? [];

      if (!args.abi || args.abi.length === 0) {
        return { content: [{ type: "text" as const, text: JSON.stringify({ tx_hash: args.tx_hash, log_count: logs.length, logs }, null, 2) }] };
      }

      // Decode with provided ABI
      const { Interface } = await import("ethers");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const iface = new Interface(args.abi as any);
      const decoded = logs.map((log, idx) => {
        try {
          const parsed = iface.parseLog({ topics: log.topics, data: log.data });
          if (!parsed) return { index: idx, address: log.address, raw: log, decoded: null };
          return {
            index:   idx,
            address: log.address,
            event:   parsed.name,
            args:    Object.fromEntries(
              parsed.fragment.inputs.map((inp, i) => [inp.name || `arg${i}`, parsed.args[i]?.toString() ?? null])
            ),
          };
        } catch {
          return { index: idx, address: log.address, raw: log, decoded: null };
        }
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ tx_hash: args.tx_hash, log_count: logs.length, decoded }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // C3 — get_transaction_status
  server.registerTool("get_transaction_status", {
    description: "Lightweight success/fail check for a transaction.",
    inputSchema: z.object({ tx_hash: txHash, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<{ status: string }>("transaction", "gettxreceiptstatus", { txhash: args.tx_hash }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ hash: args.tx_hash, success: raw.status === "1" }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
