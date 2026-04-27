import { z }               from "zod";
import { execFile }        from "node:child_process";
import { promisify }       from "node:util";
import type { McpServer }  from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { mcpError } from "../errors.js";
import { address, chainId } from "./schemas.js";

const execFileAsync = promisify(execFile);

// ── well-known selectors for standard detection ───────────────────────────────
const KNOWN_SELECTORS: Record<string, { sig: string; standard: string }> = {
  "0x18160ddd": { sig: "totalSupply()",                                standard: "ERC-20"  },
  "0x70a08231": { sig: "balanceOf(address)",                           standard: "ERC-20"  },
  "0xa9059cbb": { sig: "transfer(address,uint256)",                    standard: "ERC-20"  },
  "0x23b872dd": { sig: "transferFrom(address,address,uint256)",        standard: "ERC-20"  },
  "0x095ea7b3": { sig: "approve(address,uint256)",                     standard: "ERC-20"  },
  "0xdd62ed3e": { sig: "allowance(address,address)",                   standard: "ERC-20"  },
  "0x06fdde03": { sig: "name()",                                       standard: "ERC-20/721" },
  "0x95d89b41": { sig: "symbol()",                                     standard: "ERC-20/721" },
  "0x313ce567": { sig: "decimals()",                                   standard: "ERC-20"  },
  "0x6352211e": { sig: "ownerOf(uint256)",                             standard: "ERC-721" },
  "0xc87b56dd": { sig: "tokenURI(uint256)",                            standard: "ERC-721" },
  "0x42842e0e": { sig: "safeTransferFrom(address,address,uint256)",    standard: "ERC-721" },
  "0xb88d4fde": { sig: "safeTransferFrom(address,address,uint256,bytes)", standard: "ERC-721" },
  "0xe985e9c5": { sig: "isApprovedForAll(address,address)",            standard: "ERC-721/1155" },
  "0xa22cb465": { sig: "setApprovalForAll(address,bool)",              standard: "ERC-721/1155" },
  "0x4e1273f4": { sig: "balanceOfBatch(address[],uint256[])",          standard: "ERC-1155" },
  "0xf242432a": { sig: "safeTransferFrom(address,address,uint256,uint256,bytes)", standard: "ERC-1155" },
  "0x8da5cb5b": { sig: "owner()",                                      standard: "Ownable" },
  "0xf2fde38b": { sig: "transferOwnership(address)",                   standard: "Ownable" },
  "0x715018a6": { sig: "renounceOwnership()",                          standard: "Ownable" },
  "0x5c60da1b": { sig: "implementation()",                             standard: "Proxy"   },
  "0x3659cfe6": { sig: "upgradeTo(address)",                           standard: "Proxy"   },
  "0x4f1ef286": { sig: "upgradeToAndCall(address,bytes)",              standard: "Proxy"   },
  "0x36568abe": { sig: "renounceRole(bytes32,address)",                standard: "AccessControl" },
  "0x2f2ff15d": { sig: "grantRole(bytes32,address)",                   standard: "AccessControl" },
  "0x91d14854": { sig: "hasRole(bytes32,address)",                     standard: "AccessControl" },
  "0x6e553f65": { sig: "deposit(uint256,address)",                     standard: "ERC-4626" },
  "0x2e1a7d4d": { sig: "withdraw(uint256,address,address)",            standard: "ERC-4626" },
  "0xd0e30db0": { sig: "deposit()",                                    standard: "WETH"    },
  "0xe8e33700": { sig: "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)", standard: "Uniswap V2 Router" },
  "0x0902f1ac": { sig: "getReserves()",                                standard: "Uniswap V2 Pair" },
  "0x3850c7bd": { sig: "slot0()",                                      standard: "Uniswap V3 Pool" },
  "0x1a686502": { sig: "liquidity()",                                  standard: "Uniswap V3 Pool" },
  "0x6a761202": { sig: "execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)", standard: "Gnosis Safe" },
  "0xa0e67e2b": { sig: "getOwners()",                                  standard: "Gnosis Safe" },
};

// Extract 4-byte selectors from EVM bytecode by scanning for PUSH4 (0x63) + EQ (0x14) pattern.
// This is the standard dispatcher pattern for Solidity functions.
export function extractSelectors(bytecodeHex: string): string[] {
  const hex  = bytecodeHex.startsWith("0x") ? bytecodeHex.slice(2) : bytecodeHex;
  const seen = new Set<string>();

  for (let i = 0; i < hex.length - 10; i += 2) {
    // PUSH4 opcode = 0x63
    if (hex.slice(i, i + 2) === "63") {
      const selector = "0x" + hex.slice(i + 2, i + 10).toLowerCase();
      // EQ opcode (0x14) follows immediately after PUSH4 + 4 bytes
      if (hex.slice(i + 10, i + 12) === "14") {
        seen.add(selector);
      }
    }
  }
  return [...seen];
}

// Detect which ERC standards are likely implemented based on found selectors.
export function detectStandards(selectors: string[]): string[] {
  const counts: Record<string, number> = {};
  for (const sel of selectors) {
    const known = KNOWN_SELECTORS[sel];
    if (known) {
      counts[known.standard] = (counts[known.standard] ?? 0) + 1;
    }
  }

  const ERC20_REQUIRED  = ["0x18160ddd", "0x70a08231", "0xa9059cbb", "0x23b872dd", "0x095ea7b3"];
  const ERC721_REQUIRED = ["0x6352211e", "0x42842e0e"];
  const ERC1155_REQUIRED = ["0x4e1273f4", "0xf242432a"];

  const found = new Set(selectors);
  const standards: string[] = [];
  if (ERC20_REQUIRED.every(s => found.has(s)))   standards.push("ERC-20");
  if (ERC721_REQUIRED.every(s => found.has(s)))  standards.push("ERC-721");
  if (ERC1155_REQUIRED.every(s => found.has(s))) standards.push("ERC-1155");
  if (found.has("0x5c60da1b") || found.has("0x3659cfe6")) standards.push("Proxy");
  if (found.has("0x6a761202") && found.has("0xa0e67e2b"))  standards.push("Gnosis Safe");
  if (found.has("0x8da5cb5b") && found.has("0xf2fde38b"))  standards.push("Ownable");
  if (found.has("0x91d14854") && found.has("0x2f2ff15d"))  standards.push("AccessControl");
  if (found.has("0x6e553f65") && found.has("0x2e1a7d4d"))  standards.push("ERC-4626");
  if (found.has("0x0902f1ac"))                              standards.push("Uniswap V2 Pair");
  if (found.has("0x3850c7bd"))                              standards.push("Uniswap V3 Pool");
  if (found.has("0xd0e30db0"))                              standards.push("WETH");

  return standards;
}

export function registerBytecode(server: McpServer, es: EtherscanClient): void {

  // S1 — selector_lookup
  server.registerTool("selector_lookup", {
    description: "Look up the human-readable function signature(s) for a 4-byte selector using 4byte.directory. Useful for understanding unverified contracts. Returns all known candidates.",
    inputSchema: z.object({
      selector: z.string().regex(/^0x[0-9a-fA-F]{8}$/).describe("4-byte function selector (8 hex chars with 0x prefix)"),
    }),
  }, async (args) => {
    try {
      const sel = args.selector.toLowerCase();

      // Check local known selectors first (instant, no network)
      const local = KNOWN_SELECTORS[sel];

      // Query 4byte.directory
      const res = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}`);
      type FourByteResult = { count: number; results: Array<{ id: number; text_signature: string; hex_signature: string }> };
      const json = await res.json() as FourByteResult;

      const candidates = json.results.map(r => ({
        id:        r.id,
        signature: r.text_signature,
        known:     local?.sig === r.text_signature,
        standard:  KNOWN_SELECTORS[sel]?.standard ?? null,
      }));

      return { content: [{ type: "text" as const, text: JSON.stringify({
        selector:   sel,
        count:      json.count,
        candidates,
        local_match: local ?? null,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("NETWORK_ERROR", err)) }], isError: true };
    }
  });

  // S2 — fingerprint_bytecode
  server.registerTool("fingerprint_bytecode", {
    description: "Analyse unverified contract bytecode: extract all function selectors from the dispatcher, identify which ones match known signatures (ERC-20/721/1155, Proxy, Safe, etc.), and detect implemented standards — without any source code.",
    inputSchema: z.object({
      address,
      chain_id: chainId,
      lookup_unknown: z.boolean().optional().describe("Query 4byte.directory for unrecognised selectors (default: true, adds network calls)"),
    }),
  }, async (args) => {
    try {
      const cid      = args.chain_id ?? 1;
      const bytecode = await es.get<string>("proxy", "eth_getCode", { address: args.address, tag: "latest" }, cid);

      if (!bytecode || bytecode === "0x") {
        return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, is_contract: false }) }] };
      }

      const selectors  = extractSelectors(bytecode);
      const standards  = detectStandards(selectors);

      const annotated: Array<Record<string, unknown>> = [];
      for (const sel of selectors) {
        const known = KNOWN_SELECTORS[sel];
        const entry: Record<string, unknown> = { selector: sel };

        if (known) {
          entry["signature"] = known.sig;
          entry["standard"]  = known.standard;
          entry["source"]    = "local";
        } else if (args.lookup_unknown !== false) {
          try {
            const res  = await fetch(`https://www.4byte.directory/api/v1/signatures/?hex_signature=${sel}`);
            type FBR = { results: Array<{ text_signature: string }> };
            const json = await res.json() as FBR;
            if (json.results.length > 0) {
              entry["signature"] = json.results[0]!.text_signature;
              entry["source"]    = "4byte.directory";
              if (json.results.length > 1) {
                entry["candidates"] = json.results.map(r => r.text_signature);
              }
            } else {
              entry["signature"] = null;
              entry["source"]    = "unknown";
            }
          } catch {
            entry["signature"] = null;
            entry["source"]    = "lookup-failed";
          }
        } else {
          entry["signature"] = null;
          entry["source"]    = "not-looked-up";
        }
        annotated.push(entry);
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        address:        args.address,
        is_contract:    true,
        bytecode_size:  (bytecode.length - 2) / 2,
        selector_count: selectors.length,
        detected_standards: standards,
        selectors:      annotated,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // S3 — decompile_bytecode
  server.registerTool("decompile_bytecode", {
    description: "Decompile contract bytecode to pseudo-Solidity using Heimdall (heimdall-rs). Requires `heimdall` to be installed (`cargo install heimdall-rs`). Output is approximate — useful for understanding intent when no source is available.",
    inputSchema: z.object({
      address,
      chain_id:  chainId,
      rpc_url:   z.string().url().optional().describe("RPC URL for Heimdall to fetch the bytecode directly (optional — if omitted, fetches via Etherscan first and passes hex)"),
    }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;

      if (args.rpc_url) {
        // Let heimdall fetch it directly
        const { stdout, stderr } = await execFileAsync(
          "heimdall", ["decompile", args.address, "--rpc-url", args.rpc_url, "--output", "stdout"],
          { timeout: 120_000 }
        ).catch(e => e as { stdout: string; stderr: string });
        return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, decompiled: stdout, stderr }, null, 2) }] };
      }

      // Fetch bytecode first then pass hex to heimdall
      const bytecode = await es.get<string>("proxy", "eth_getCode", { address: args.address, tag: "latest" }, cid);
      if (!bytecode || bytecode === "0x") {
        return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, is_contract: false }) }] };
      }

      const { stdout, stderr } = await execFileAsync(
        "heimdall", ["decompile", bytecode, "--output", "stdout"],
        { timeout: 120_000 }
      ).catch(e => e as { stdout: string; stderr: string });

      return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, decompiled: stdout, stderr }, null, 2) }] };
    } catch (err) {
      const e = err as { message?: string };
      if (e.message?.includes("ENOENT") || e.message?.includes("not found")) {
        return { content: [{ type: "text" as const, text: JSON.stringify({
          available: false,
          error:     "heimdall not installed — run: cargo install heimdall-rs",
        }) }] };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("COMPILE_ERROR", err)) }], isError: true };
    }
  });
}
