import { z }                from "zod";
import type { McpServer }   from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AnvilManager } from "../anvil/manager.js";
import { encodeCall, decodeResult, serialise } from "../abi/codec.js";
import { decodeRevert } from "./analysis.js";
import { mcpError } from "../errors.js";
import { address } from "./schemas.js";

function requireFork(anvil: AnvilManager) {
  if (!anvil.running || !anvil.client) {
    throw new Error("No fork is running. Call fork_start first.");
  }
  return anvil.client;
}

export function registerFork(server: McpServer, anvil: AnvilManager): void {

  // F1 — fork_start
  server.registerTool("fork_start", {
    description: "Start a local Anvil fork of any EVM chain at a specific block. Once running, use fork_call and fork_send to simulate transactions with full state mutation. Requires forge/anvil to be installed.",
    inputSchema: z.object({
      rpc_url:      z.string().url().describe("JSON-RPC URL to fork from (Alchemy, Infura, or any public endpoint). Example: https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY"),
      block_number: z.number().int().nonnegative().optional().describe("Block number to fork at (default: latest)"),
      port:         z.number().int().min(1024).max(65535).optional().describe("Local port for the Anvil node (default: 8545)"),
    }),
  }, async (args) => {
    try {
      const status = await anvil.start(args.rpc_url, args.block_number, args.port);
      return { content: [{ type: "text" as const, text: JSON.stringify({ started: true, ...status }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // F2 — fork_stop
  server.registerTool("fork_stop", {
    description: "Stop the running Anvil fork and discard all forked state.",
    inputSchema: z.object({}),
  }, async () => {
    anvil.stop();
    return { content: [{ type: "text" as const, text: JSON.stringify({ stopped: true }) }] };
  });

  // F3 — fork_status
  server.registerTool("fork_status", {
    description: "Check whether an Anvil fork is running and get its configuration.",
    inputSchema: z.object({}),
  }, async () => {
    return { content: [{ type: "text" as const, text: JSON.stringify(anvil.status, null, 2) }] };
  });

  // F4 — fork_call
  server.registerTool("fork_call", {
    description: "Execute a read call against the forked state. Like call_contract but against the local fork — reflects any state mutations made by fork_send.",
    inputSchema: z.object({
      address,
      function_sig: z.string().describe('Function signature with return types, e.g. "balanceOf(address) returns (uint256)"'),
      args:         z.array(z.union([z.string(), z.number(), z.boolean(), z.bigint()])).optional(),
      block_tag:    z.string().optional().describe('Block tag (default: "latest")'),
    }),
  }, async (args) => {
    try {
      const rpc      = requireFork(anvil);
      const calldata = encodeCall(args.function_sig, (args.args ?? []) as unknown[]);

      const raw = await rpc.call<string>("eth_call", [
        { to: args.address, data: calldata },
        args.block_tag ?? "latest",
      ]);

      let result: unknown = raw;
      try { result = serialise(decodeResult(args.function_sig, raw)); } catch { /* leave raw */ }

      return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, function_sig: args.function_sig, result, raw_hex: raw }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // F5 — fork_impersonate
  server.registerTool("fork_impersonate", {
    description: "Start impersonating an address on the fork. After calling this, fork_send can send transactions from that address without a private key — Anvil signs them automatically.",
    inputSchema: z.object({
      address,
      stop: z.boolean().optional().describe("If true, stop impersonating the address (default: false)"),
    }),
  }, async (args) => {
    try {
      const rpc    = requireFork(anvil);
      const method = args.stop ? "anvil_stopImpersonatingAccount" : "anvil_impersonateAccount";
      await rpc.call<null>(method, [args.address]);
      return { content: [{ type: "text" as const, text: JSON.stringify({ impersonating: !args.stop, address: args.address }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // F6 — fork_send
  server.registerTool("fork_send", {
    description: "Send a transaction on the fork from an impersonated address. State changes persist in the fork session. Call fork_impersonate first to enable sending from any address without a private key.",
    inputSchema: z.object({
      from:         address.describe("Sender address (must be impersonated via fork_impersonate)"),
      to:           address.describe("Target contract or EOA"),
      function_sig: z.string().optional().describe('Function signature, e.g. "transfer(address,uint256)". Omit to send raw data or ETH.'),
      args:         z.array(z.union([z.string(), z.number(), z.boolean(), z.bigint()])).optional(),
      data:         z.string().regex(/^0x[0-9a-fA-F]*$/).optional().describe("Raw calldata hex (alternative to function_sig+args)"),
      value:        z.string().optional().describe("ETH value in wei (decimal or hex)"),
      gas_limit:    z.string().optional().describe("Gas limit in hex or decimal (default: auto-estimated)"),
    }),
  }, async (args) => {
    try {
      const rpc = requireFork(anvil);

      let calldata = args.data ?? "0x";
      if (args.function_sig) {
        calldata = encodeCall(args.function_sig, (args.args ?? []) as unknown[]);
      }

      const txObj: Record<string, string> = { from: args.from, to: args.to, data: calldata };
      if (args.value)     txObj["value"]    = args.value.startsWith("0x") ? args.value : `0x${BigInt(args.value).toString(16)}`;
      if (args.gas_limit) txObj["gas"]      = args.gas_limit.startsWith("0x") ? args.gas_limit : `0x${BigInt(args.gas_limit).toString(16)}`;

      let txHash: string;
      let reverted = false;
      let revertInfo: unknown = null;

      try {
        txHash = await rpc.call<string>("eth_sendTransaction", [txObj]);
      } catch (sendErr) {
        const msg      = sendErr instanceof Error ? sendErr.message : String(sendErr);
        const hexMatch = /0x[0-9a-fA-F]{8,}/.exec(msg);
        reverted   = true;
        revertInfo = decodeRevert(hexMatch?.[0] ?? "0x");
        return { content: [{ type: "text" as const, text: JSON.stringify({ reverted: true, revert: revertInfo, raw_error: msg }) }] };
      }

      // Fetch receipt to confirm inclusion
      let receipt: unknown = null;
      for (let i = 0; i < 10; i++) {
        receipt = await rpc.call<unknown>("eth_getTransactionReceipt", [txHash]);
        if (receipt) break;
        await new Promise(r => setTimeout(r, 200));
      }

      return { content: [{ type: "text" as const, text: JSON.stringify(serialise({ tx_hash: txHash, reverted, revert: revertInfo, receipt }), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // F7 — fork_set_balance
  server.registerTool("fork_set_balance", {
    description: "Set the ETH balance of any address on the fork. Useful for funding test accounts before sending transactions.",
    inputSchema: z.object({
      address,
      balance: z.string().describe("ETH balance in wei (decimal or hex). Example: '1000000000000000000' for 1 ETH."),
    }),
  }, async (args) => {
    try {
      const rpc     = requireFork(anvil);
      const hexWei  = args.balance.startsWith("0x") ? args.balance : `0x${BigInt(args.balance).toString(16)}`;
      await rpc.call<null>("anvil_setBalance", [args.address, hexWei]);
      return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, balance_wei: args.balance, balance_eth: (Number(BigInt(args.balance.startsWith("0x") ? args.balance : args.balance)) / 1e18).toFixed(6) }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // F8 — fork_mine
  server.registerTool("fork_mine", {
    description: "Mine one or more blocks on the fork. Advances block.number and block.timestamp — useful when testing time-dependent logic (vesting, lock periods, etc.).",
    inputSchema: z.object({
      blocks:    z.number().int().positive().optional().describe("Number of blocks to mine (default: 1)"),
      timestamp: z.number().int().positive().optional().describe("Set the timestamp of the next block (Unix seconds)"),
    }),
  }, async (args) => {
    try {
      const rpc = requireFork(anvil);

      if (args.timestamp) {
        await rpc.call<null>("evm_setNextBlockTimestamp", [`0x${args.timestamp.toString(16)}`]);
      }

      const n = args.blocks ?? 1;
      await rpc.call<null>("anvil_mine", [`0x${n.toString(16)}`]);

      const blockHex = await rpc.call<string>("eth_blockNumber", []);
      const block    = parseInt(blockHex, 16);
      return { content: [{ type: "text" as const, text: JSON.stringify({ mined: n, current_block: block }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // F9 — fork_reset
  server.registerTool("fork_reset", {
    description: "Reset the fork to a different block number or RPC URL, discarding all accumulated state changes. Faster than fork_stop + fork_start.",
    inputSchema: z.object({
      rpc_url:      z.string().url().optional().describe("New RPC URL to fork from (default: same as current)"),
      block_number: z.number().int().nonnegative().optional().describe("New block number to fork at (default: latest)"),
    }),
  }, async (args) => {
    try {
      const rpc = requireFork(anvil);
      const forking: Record<string, unknown> = {};
      if (args.rpc_url)      forking["jsonRpcUrl"]  = args.rpc_url;
      if (args.block_number) forking["blockNumber"]  = args.block_number;

      await rpc.call<null>("anvil_reset", [{ forking }]);
      return { content: [{ type: "text" as const, text: JSON.stringify({ reset: true, ...forking }) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });
}
