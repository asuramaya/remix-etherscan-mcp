import { z } from "zod";
import { ethers } from "ethers";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { encodeCall, decodeResult, serialise } from "../abi/codec.js";
import { mcpError } from "../errors.js";
import { address, chainId } from "./schemas.js";

export function registerProxy(server: McpServer, es: EtherscanClient): void {

  // I1 — eth_block_number
  server.registerTool("eth_block_number", {
    description: "Latest block number.",
    inputSchema: z.object({ chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("proxy", "eth_blockNumber", {}, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ block_number: parseInt(raw, 16) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I2 — eth_call
  server.registerTool("eth_call", {
    description: "Read-only contract call. Provide either raw `data` hex or `function_signature` + `args` for auto-encoding. Use `from` to simulate msg.sender for access-control checks.",
    inputSchema: z.object({
      to:                 address,
      from:               address.optional().describe("Simulate msg.sender (useful for testing onlyOwner guards)"),
      data:               z.string().optional(),
      function_signature: z.string().optional(),
      args:               z.array(z.unknown()).optional(),
      abi:                z.array(z.unknown()).optional(),
      tag:                z.string().optional(),
      chain_id:           chainId,
    }),
  }, async (args) => {
    try {
      let calldata = args.data;
      if (!calldata && args.function_signature) {
        calldata = encodeCall(args.function_signature, args.args ?? []);
      }
      if (!calldata) throw new Error("Provide either `data` or `function_signature`");

      const raw = await es.get<string>("proxy", "eth_call", { to: args.to, from: args.from, data: calldata, tag: args.tag ?? "latest" }, args.chain_id);

      let decoded: unknown = null;
      if (args.function_signature && raw !== "0x") {
        try { decoded = serialise(decodeResult(args.function_signature, raw)); } catch { /* ignore */ }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ result_hex: raw, result_decoded: decoded }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I3 — eth_get_storage_at
  server.registerTool("eth_get_storage_at", {
    description: "Raw storage slot value at a given address and position.",
    inputSchema: z.object({ address, position: z.string(), tag: z.string().optional(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("proxy", "eth_getStorageAt", { address: args.address, position: args.position, tag: args.tag ?? "latest" }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ value: raw }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I4 — eth_get_code
  server.registerTool("eth_get_code", {
    description: "Contract bytecode at an address.",
    inputSchema: z.object({ address, tag: z.string().optional(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("proxy", "eth_getCode", { address: args.address, tag: args.tag ?? "latest" }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ bytecode: raw, is_contract: raw !== "0x" }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I5 — eth_get_transaction_count
  server.registerTool("eth_get_transaction_count", {
    description: "Address nonce (transaction count).",
    inputSchema: z.object({ address, tag: z.string().optional(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("proxy", "eth_getTransactionCount", { address: args.address, tag: args.tag ?? "latest" }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ nonce: parseInt(raw, 16) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I6 — eth_gas_price
  server.registerTool("eth_gas_price", {
    description: "Current gas price in wei and gwei.",
    inputSchema: z.object({ chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("proxy", "eth_gasPrice", {}, args.chain_id);
      const wei = BigInt(raw);
      return { content: [{ type: "text" as const, text: JSON.stringify({ gas_price_wei: wei.toString(), gas_price_gwei: (Number(wei) / 1e9).toFixed(4) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I7 — eth_estimate_gas
  server.registerTool("eth_estimate_gas", {
    description: "Gas estimate for a transaction.",
    inputSchema: z.object({
      to:        address.optional(),
      from:      address.optional(),
      data:      z.string().optional(),
      value:     z.string().optional(),
      gas:       z.string().optional(),
      gas_price: z.string().optional(),
      chain_id:  chainId,
    }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("proxy", "eth_estimateGas", {
        to: args.to, from: args.from, data: args.data,
        value: args.value, gas: args.gas, gasPrice: args.gas_price,
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ gas_estimate: parseInt(raw, 16) }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I8 — eth_send_raw_transaction
  server.registerTool("eth_send_raw_transaction", {
    description: "Broadcast a pre-signed raw transaction hex to the network.",
    inputSchema: z.object({ signed_tx_hex: z.string(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("proxy", "eth_sendRawTransaction", { hex: args.signed_tx_hex }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ tx_hash: raw }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I8b — contract_read_multi
  server.registerTool("contract_read_multi", {
    description: "Read multiple state variables from a contract in one tool call. Executes eth_call for each function with a rate-limit-safe delay between calls.",
    inputSchema: z.object({
      contract:  address.describe("Contract address"),
      calls: z.array(z.object({
        function_signature: z.string().describe("e.g. 'balanceOf(address) returns (uint256)' — include return type for decoding"),
        args:               z.array(z.unknown()).optional(),
        label:              z.string().optional().describe("Human-readable name for this result"),
      })).min(1).max(50),
      tag:      z.string().optional(),
      chain_id: chainId,
    }),
  }, async (args) => {
    try {
      const results: { label: string; function_signature: string; result_hex: string; result_decoded: unknown }[] = [];
      for (const call of args.calls) {
        const calldata = encodeCall(call.function_signature, call.args ?? []);
        // 350ms gap keeps us safely under the 3/s Etherscan free-tier limit
        if (results.length > 0) await new Promise(r => setTimeout(r, 350));
        const raw = await es.get<string>("proxy", "eth_call", { to: args.contract, data: calldata, tag: args.tag ?? "latest" }, args.chain_id);
        let decoded: unknown = null;
        if (raw !== "0x") {
          try { decoded = serialise(decodeResult(call.function_signature, raw)); } catch { /* ignore */ }
        }
        results.push({ label: call.label ?? call.function_signature, function_signature: call.function_signature, result_hex: raw, result_decoded: decoded });
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ contract: args.contract, results }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I10 — ens_resolve
  server.registerTool("ens_resolve", {
    description: "Resolve an ENS name to an Ethereum address. Uses the mainnet ENS registry; chain_id is ignored for the registry lookup but must be 1 (mainnet).",
    inputSchema: z.object({
      name:     z.string().describe("ENS name to resolve, e.g. 'vitalik.eth'"),
      chain_id: chainId,
    }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;
      const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
      const node = ethers.namehash(args.name);

      // resolver(bytes32) → address
      const resolverRaw = await es.get<string>("proxy", "eth_call", {
        to: ENS_REGISTRY, data: encodeCall("resolver(bytes32) returns (address)", [node]), tag: "latest",
      }, cid);
      const resolverAddr = ethers.getAddress("0x" + resolverRaw.slice(-40));
      if (resolverAddr === ethers.ZeroAddress) throw new Error(`No resolver set for '${args.name}'`);

      // addr(bytes32) → address
      const addrRaw = await es.get<string>("proxy", "eth_call", {
        to: resolverAddr, data: encodeCall("addr(bytes32) returns (address)", [node]), tag: "latest",
      }, cid);
      const resolvedAddr = ethers.getAddress("0x" + addrRaw.slice(-40));
      if (resolvedAddr === ethers.ZeroAddress) throw new Error(`'${args.name}' resolves to zero address — name may be unclaimed`);

      return { content: [{ type: "text" as const, text: JSON.stringify({
        name: args.name, namehash: node, resolver: resolverAddr, address: resolvedAddr,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I11 — read_proxy_slots
  server.registerTool("read_proxy_slots", {
    description: "Read standard proxy storage slots (EIP-1967 implementation, admin, beacon) from a contract address. Useful for identifying proxy targets without verified source.",
    inputSchema: z.object({
      address,
      tag:      z.string().optional().describe("Block tag (default: latest)"),
      chain_id: chainId,
    }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;
      const tag = args.tag ?? "latest";
      const SLOTS: Record<string, string> = {
        eip1967_implementation: "0x360894a13ba1a3210667c828492db98dca3e2076635130ab13d11325969a32b",
        eip1967_admin:          "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
        eip1967_beacon:         "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
        oz_implementation:      "0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3",
      };
      const ZERO = "0x" + "0".repeat(64);
      const results: Record<string, { slot: string; raw: string; address: string | null }> = {};

      for (const [name, slot] of Object.entries(SLOTS)) {
        if (Object.keys(results).length > 0) await new Promise(r => setTimeout(r, 350));
        const raw = await es.get<string>("proxy", "eth_getStorageAt", { address: args.address, position: slot, tag }, cid);
        results[name] = { slot, raw, address: raw && raw !== ZERO ? "0x" + raw.slice(-40) : null };
      }

      const impl = results["eip1967_implementation"]?.address ?? results["oz_implementation"]?.address;
      return { content: [{ type: "text" as const, text: JSON.stringify({
        address: args.address, implementation: impl ?? null, proxy_slots: results,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // I9 — eth_get_uncle
  server.registerTool("eth_get_uncle", {
    description: "Uncle block by block number and uncle index.",
    inputSchema: z.object({ block_number: z.union([z.number().int().nonnegative(), z.string()]), uncle_index: z.number().int().nonnegative(), chain_id: chainId }),
  }, async (args) => {
    try {
      const tag = typeof args.block_number === "number" ? `0x${args.block_number.toString(16)}` : args.block_number;
      const raw = await es.get<object>("proxy", "eth_getUncleByBlockNumberAndIndex", { tag, index: `0x${args.uncle_index.toString(16)}` }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
