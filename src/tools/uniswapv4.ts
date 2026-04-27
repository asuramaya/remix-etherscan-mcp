import { z }                from "zod";
import { ethers }           from "ethers";
import type { McpServer }   from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import type { JsonRpcClient }   from "../rpc/client.js";
import { encodeCall, decodeResult, serialise } from "../abi/codec.js";
import { decodeRevert } from "./analysis.js";
import { mcpError } from "../errors.js";
import { address, chainId } from "./schemas.js";

// ── V4 canonical deployments ──────────────────────────────────────────────────
// Source: https://docs.uniswap.org/contracts/v4/deployments

interface V4Deployment {
  poolManager: string;
  v4Quoter:    string;
  stateView:   string;
}

const V4_DEPLOYMENTS: Record<number, V4Deployment> = {
  1: { // Ethereum mainnet
    poolManager: "0x000000000004444c5dC75cB358380D2e3dE08A90",
    v4Quoter:    "0x52F0E24D1c21C8A0cB1e5a5dD6198556BD9E1203",
    stateView:   "0x7fFE42C4a5DEeA5b0feC41C94C136Cf115597227",
  },
  8453: { // Base
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    v4Quoter:    "0x0d5e0F971ED27FBfF6c2837bf31316121532048D",
    stateView:   "0xA3c0c9b65baD0b08107Aa264b0f3dB444b867A71",
  },
  42161: { // Arbitrum
    poolManager: "0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32",
    v4Quoter:    "0x3972c00f7Ed4885e145823eB7C655375D275A1C5",
    stateView:   "0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990",
  },
  10: { // Optimism
    poolManager: "0x9a13F98Cb987694C9F086b1F5eB990EeA8264Ec3",
    v4Quoter:    "0x1f3131A13296Fb91c90870043742C3cdBfF1A8D7",
    stateView:   "0xc18a3169788F4F75A170290584ECA6395C75Ecdb",
  },
  130: { // Unichain
    poolManager: "0x1f98400000000000000000000000000000000004",
    v4Quoter:    "0x333E3C607B141b18fF6de9f3739014b94066b86C",
    stateView:   "0x86e8631A016f9068C3f085F1a4FbBfb31D6E2D54",
  },
};

// ── Initialize event ──────────────────────────────────────────────────────────
// event Initialize(PoolId indexed id, Currency indexed currency0, Currency indexed currency1,
//                  uint24 fee, int24 tickSpacing, address hooks, uint160 sqrtPriceX96, int24 tick)

const INITIALIZE_TOPIC = ethers.id(
  "Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)",
);

const INITIALIZE_DATA_TYPES = ["uint24", "int24", "address", "uint160", "int24"];

// ── Hook permission flags (from Uniswap V4 Hooks library) ─────────────────────
// The hook address's lowest 14 bits encode permission flags.
const HOOK_FLAGS: Array<{ bit: number; name: string }> = [
  { bit: 13, name: "BEFORE_INITIALIZE"                  },
  { bit: 12, name: "AFTER_INITIALIZE"                   },
  { bit: 11, name: "BEFORE_ADD_LIQUIDITY"               },
  { bit: 10, name: "AFTER_ADD_LIQUIDITY"                },
  { bit:  9, name: "BEFORE_REMOVE_LIQUIDITY"            },
  { bit:  8, name: "AFTER_REMOVE_LIQUIDITY"             },
  { bit:  7, name: "BEFORE_SWAP"                        },
  { bit:  6, name: "AFTER_SWAP"                         },
  { bit:  5, name: "BEFORE_DONATE"                      },
  { bit:  4, name: "AFTER_DONATE"                       },
  { bit:  3, name: "BEFORE_SWAP_RETURNS_DELTA"          },
  { bit:  2, name: "AFTER_SWAP_RETURNS_DELTA"           },
  { bit:  1, name: "AFTER_ADD_LIQUIDITY_RETURNS_DELTA"  },
  { bit:  0, name: "AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA" },
];

export function decodeHookPermissions(hookAddr: string): {
  hookless: boolean;
  flags:    string[];
  rawBits:  string;
} {
  if (hookAddr === ethers.ZeroAddress || /^0x0+$/.test(hookAddr)) {
    return { hookless: true, flags: [], rawBits: "0".padStart(14, "0") };
  }
  // Lowest 14 bits of the address
  const last4 = parseInt(hookAddr.slice(-4), 16) & 0x3fff;
  const flags: string[] = [];
  for (const { bit, name } of HOOK_FLAGS) {
    if (last4 & (1 << bit)) flags.push(name);
  }
  return { hookless: false, flags, rawBits: last4.toString(2).padStart(14, "0") };
}

// ── PoolKey encoding ──────────────────────────────────────────────────────────
// struct PoolKey { Currency currency0; Currency currency1; uint24 fee; int24 tickSpacing; IHooks hooks; }

export interface PoolKey {
  currency0:   string;
  currency1:   string;
  fee:         number;
  tickSpacing: number;
  hooks:       string;
}

const POOL_KEY_TUPLE = "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";

// PoolId = keccak256(abi.encode(poolKey))
export function poolIdFromKey(k: PoolKey): string {
  const coder = ethers.AbiCoder.defaultAbiCoder();
  const enc = coder.encode([POOL_KEY_TUPLE], [[k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks]]);
  return ethers.keccak256(enc);
}

// ── Tool registration ─────────────────────────────────────────────────────────

export function registerUniswapV4(
  server:    McpServer,
  es:        EtherscanClient,
  rpcClient: JsonRpcClient | null,
): void {

  // V1 — v4_deployments
  server.registerTool("v4_deployments", {
    description: "List the canonical Uniswap V4 contract addresses (PoolManager, V4Quoter, StateView) for supported chains.",
    inputSchema: z.object({
      chain_id: chainId.optional(),
    }),
  }, async (args) => {
    const cid = args.chain_id;
    if (cid !== undefined && cid !== null) {
      const d = V4_DEPLOYMENTS[cid];
      if (!d) {
        return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NOT_FOUND", `V4 not deployed on chain ${cid}`)) }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({ chain_id: cid, ...d }, null, 2) }] };
    }
    return { content: [{ type: "text" as const, text: JSON.stringify(V4_DEPLOYMENTS, null, 2) }] };
  });

  // V2 — v4_hook_permissions
  server.registerTool("v4_hook_permissions", {
    description: "Decode the permission flags encoded in a Uniswap V4 hook address. Hook permissions are stored in the lowest 14 bits of the address — the address must be CREATE2-mined to embed the permissions. Returns which lifecycle methods (beforeSwap, afterSwap, beforeSwapReturnsDelta, etc.) the hook can intercept.",
    inputSchema: z.object({
      hook_address: address,
    }),
  }, async (args) => {
    const decoded = decodeHookPermissions(args.hook_address);
    return { content: [{ type: "text" as const, text: JSON.stringify({
      hook_address: args.hook_address,
      ...decoded,
    }, null, 2) }] };
  });

  // V3 — v4_find_pools
  server.registerTool("v4_find_pools", {
    description: "Find all Uniswap V4 pools that contain the given token, by scanning PoolManager.Initialize events. Returns each matching pool's PoolKey (currency0, currency1, fee, tickSpacing, hooks), PoolId, init block, and tx hash. Use `v4_hook_permissions` on the returned `hooks` address to inspect what lifecycle methods the hook intercepts.",
    inputSchema: z.object({
      token:      address,
      chain_id:   chainId.optional(),
      from_block: z.number().int().nonnegative().optional().describe("Earliest block to scan (default: 0)"),
      to_block:   z.union([z.number().int().nonnegative(), z.literal("latest")]).optional(),
    }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;
      const dep = V4_DEPLOYMENTS[cid];
      if (!dep) throw new Error(`V4 not deployed on chain ${cid}`);

      // Currency0 < Currency1 always — token can be either side. Run both queries.
      const tokenTopic = ethers.zeroPadValue(args.token.toLowerCase(), 32);

      const [asC0, asC1] = await Promise.all([
        es.get<unknown[]>("logs", "getLogs", {
          address:   dep.poolManager,
          fromBlock: args.from_block ?? 0,
          toBlock:   args.to_block   ?? "latest",
          topic0:    INITIALIZE_TOPIC,
          topic2:    tokenTopic, // currency0
          topic0_2_opr: "and",
        }, cid).catch(() => []),
        es.get<unknown[]>("logs", "getLogs", {
          address:   dep.poolManager,
          fromBlock: args.from_block ?? 0,
          toBlock:   args.to_block   ?? "latest",
          topic0:    INITIALIZE_TOPIC,
          topic3:    tokenTopic, // currency1
          topic0_3_opr: "and",
        }, cid).catch(() => []),
      ]);

      const coder = ethers.AbiCoder.defaultAbiCoder();
      const pools: Array<Record<string, unknown>> = [];

      for (const log of [...(asC0 ?? []), ...(asC1 ?? [])] as Array<{
        topics: string[]; data: string; blockNumber: string; transactionHash: string;
      }>) {
        if (!log.topics || log.topics.length < 4) continue;
        const id        = log.topics[1];
        const currency0 = "0x" + log.topics[2]!.slice(-40);
        const currency1 = "0x" + log.topics[3]!.slice(-40);
        const decoded   = coder.decode(INITIALIZE_DATA_TYPES, log.data);
        const [fee, tickSpacing, hooks, sqrtPriceX96, tick] = decoded;

        pools.push({
          pool_id:        id,
          currency0,
          currency1,
          fee:            Number(fee),
          tick_spacing:   Number(tickSpacing),
          hooks:          hooks,
          sqrt_price_x96: sqrtPriceX96.toString(),
          tick:           Number(tick),
          init_block:     parseInt(log.blockNumber, 16),
          tx_hash:        log.transactionHash,
        });
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        token:        args.token,
        chain_id:     cid,
        pool_manager: dep.poolManager,
        pool_count:   pools.length,
        pools,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // V4 — v4_pool_state
  server.registerTool("v4_pool_state", {
    description: "Read live pool state (slot0 price + tick, liquidity) for a Uniswap V4 pool via the StateView contract. Provide either the pool_id directly, or the full PoolKey to compute it. Requires RPC_URL.",
    inputSchema: z.object({
      pool_id:      z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional().describe("32-byte pool id"),
      pool_key:     z.object({
        currency0:    address,
        currency1:    address,
        fee:          z.number().int().nonnegative(),
        tick_spacing: z.number().int(),
        hooks:        address,
      }).optional().describe("Alternative to pool_id: the full PoolKey to derive id from"),
      chain_id:     chainId.optional(),
    }),
  }, async (args) => {
    try {
      if (!rpcClient) throw new Error("RPC_URL is not configured. Set the RPC_URL environment variable.");
      const cid = args.chain_id ?? 1;
      const dep = V4_DEPLOYMENTS[cid];
      if (!dep) throw new Error(`V4 not deployed on chain ${cid}`);

      let id = args.pool_id;
      if (!id && args.pool_key) {
        id = poolIdFromKey({
          currency0: args.pool_key.currency0,
          currency1: args.pool_key.currency1,
          fee:       args.pool_key.fee,
          tickSpacing: args.pool_key.tick_spacing,
          hooks:     args.pool_key.hooks,
        });
      }
      if (!id) throw new Error("Provide either pool_id or pool_key");

      // StateView.getSlot0(bytes32) returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)
      // StateView.getLiquidity(bytes32) returns (uint128)
      const slot0Data = encodeCall("getSlot0(bytes32) returns (uint160,int24,uint24,uint24)", [id]);
      const liqData   = encodeCall("getLiquidity(bytes32) returns (uint128)", [id]);

      const [slot0Raw, liqRaw] = await Promise.all([
        rpcClient.call<string>("eth_call", [{ to: dep.stateView, data: slot0Data }, "latest"]),
        rpcClient.call<string>("eth_call", [{ to: dep.stateView, data: liqData },   "latest"]),
      ]);

      const slot0 = decodeResult("getSlot0(bytes32) returns (uint160,int24,uint24,uint24)", slot0Raw) as unknown[];
      const liq   = decodeResult("getLiquidity(bytes32) returns (uint128)", liqRaw);

      return { content: [{ type: "text" as const, text: JSON.stringify(serialise({
        pool_id:        id,
        sqrt_price_x96: slot0[0],
        tick:           slot0[1],
        protocol_fee:   slot0[2],
        lp_fee:         slot0[3],
        liquidity:      liq,
      }), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // V5 — v4_quote
  server.registerTool("v4_quote", {
    description: "Quote a Uniswap V4 swap via V4Quoter — returns the expected output (or required input) for a swap, including all hook fees. If the quoter reverts (which is what makes the Uniswap UI refuse to trade) the revert is decoded and returned. Requires RPC_URL.",
    inputSchema: z.object({
      pool_key: z.object({
        currency0:    address,
        currency1:    address,
        fee:          z.number().int().nonnegative(),
        tick_spacing: z.number().int(),
        hooks:        address,
      }),
      zero_for_one: z.boolean().describe("true = swap currency0 → currency1; false = currency1 → currency0"),
      exact_input:  z.boolean().describe("true = exact-input quote (returns amountOut); false = exact-output quote (returns amountIn)"),
      amount:       z.string().describe("Amount in raw units (wei). For exact_input this is amountIn; for exact_output this is amountOut."),
      hook_data:    z.string().regex(/^0x[0-9a-fA-F]*$/).optional().describe("Hex-encoded hook data passed through to the hook (default: 0x)"),
      chain_id:     chainId.optional(),
    }),
  }, async (args) => {
    try {
      if (!rpcClient) throw new Error("RPC_URL is not configured. Set the RPC_URL environment variable.");
      const cid = args.chain_id ?? 1;
      const dep = V4_DEPLOYMENTS[cid];
      if (!dep) throw new Error(`V4 not deployed on chain ${cid}`);

      const k = args.pool_key;
      const poolKeyTuple = [k.currency0, k.currency1, k.fee, k.tick_spacing, k.hooks];
      const hookData = args.hook_data ?? "0x";

      // V4Quoter signatures:
      // function quoteExactInputSingle(QuoteExactSingleParams params) external returns (uint256 amountOut, uint256 gasEstimate)
      // function quoteExactOutputSingle(QuoteExactSingleParams params) external returns (uint256 amountIn, uint256 gasEstimate)
      // QuoteExactSingleParams = (PoolKey poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData)

      const fn = args.exact_input
        ? "quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes)) returns (uint256,uint256)"
        : "quoteExactOutputSingle(((address,address,uint24,int24,address),bool,uint128,bytes)) returns (uint256,uint256)";

      const params = [poolKeyTuple, args.zero_for_one, args.amount, hookData];
      const data   = encodeCall(fn, [params]);

      let raw: string;
      let reverted = false;
      let revertInfo: unknown = null;

      try {
        raw = await rpcClient.call<string>("eth_call", [{ to: dep.v4Quoter, data }, "latest"]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const hexMatch = /0x[0-9a-fA-F]{8,}/.exec(msg);
        reverted   = true;
        revertInfo = decodeRevert(hexMatch?.[0] ?? "0x");
        return { content: [{ type: "text" as const, text: JSON.stringify({
          reverted:    true,
          revert:      revertInfo,
          raw_error:   msg,
          quoter:      dep.v4Quoter,
          quote_fn:    fn.split("(")[0],
        }, null, 2) }] };
      }

      const decoded = decodeResult(fn, raw) as unknown[];
      return { content: [{ type: "text" as const, text: JSON.stringify(serialise({
        reverted:      false,
        amount_in:     args.exact_input ? args.amount : decoded[0],
        amount_out:    args.exact_input ? decoded[0]  : args.amount,
        gas_estimate:  decoded[1],
        zero_for_one:  args.zero_for_one,
        exact_input:   args.exact_input,
      }), null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });
}
