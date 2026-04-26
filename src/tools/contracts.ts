import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import { fetchSourceFromSourcify } from "../etherscan/sourcify.js";
import { mcpError } from "../errors.js";
import { address, chainId } from "./schemas.js";
import type { Config } from "../config.js";

interface EtherscanSourceResult {
  SourceCode:              string;
  ABI:                     string;
  ContractName:            string;
  CompilerVersion:         string;
  OptimizationUsed:        string;
  Runs:                    string;
  ConstructorArguments:    string;
  EVMVersion:              string;
  Library:                 string;
  LicenseType:             string;
  Proxy:                   string;
  Implementation:          string;
}

function parseSourceFiles(raw: string): Record<string, string> {
  if (!raw) return {};
  // Double-braced JSON (multi-file)
  if (raw.startsWith("{{")) {
    try {
      const inner = JSON.parse(raw.slice(1, -1)) as { sources: Record<string, { content: string }> };
      const out: Record<string, string> = {};
      for (const [p, f] of Object.entries(inner.sources)) out[p] = f.content;
      return out;
    } catch { /* fall through */ }
  }
  // Single-braced JSON standard input
  if (raw.startsWith("{")) {
    try {
      const inner = JSON.parse(raw) as { sources?: Record<string, { content: string }> };
      if (inner.sources) {
        const out: Record<string, string> = {};
        for (const [p, f] of Object.entries(inner.sources)) out[p] = f.content;
        return out;
      }
    } catch { /* fall through */ }
  }
  // Plain flattened source
  return { "flattened.sol": raw };
}

export function registerContracts(server: McpServer, es: EtherscanClient, config: Config): void {

  // B1 — get_contract_source
  server.registerTool("get_contract_source", {
    description: "Full verified source code, ABI, and compiler settings. Falls back to Sourcify if Etherscan has no source.",
    inputSchema: z.object({ address, chain_id: chainId }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;
      const raw = await es.get<EtherscanSourceResult[]>("contract", "getsourcecode", { address: args.address }, cid);
      const r   = raw[0]!;

      let sourceFiles = parseSourceFiles(r.SourceCode);
      let sourceOrigin: "etherscan" | "sourcify" = "etherscan";

      if (!r.SourceCode && config.sourcifyFallback) {
        const sf = await fetchSourceFromSourcify(cid, args.address);
        if (sf) { sourceFiles = sf; sourceOrigin = "sourcify"; }
      }

      let abi: object[] = [];
      try { abi = JSON.parse(r.ABI) as object[]; } catch { /* not parseable */ }

      const result = {
        contract_name:         r.ContractName,
        compiler_version:      r.CompilerVersion,
        optimization_used:     r.OptimizationUsed === "1",
        runs:                  Number(r.Runs),
        evm_version:           r.EVMVersion,
        license:               r.LicenseType,
        is_proxy:              r.Proxy === "1",
        implementation:        r.Implementation || null,
        abi,
        source_files:          sourceFiles,
        constructor_arguments: r.ConstructorArguments,
        verified:              Object.keys(sourceFiles).length > 0,
        source:                sourceOrigin,
      };
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B2 — get_contract_abi
  server.registerTool("get_contract_abi", {
    description: "ABI only for a verified contract, as a parsed JSON array.",
    inputSchema: z.object({ address, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("contract", "getabi", { address: args.address }, args.chain_id);
      const abi = JSON.parse(raw) as object[];
      return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, abi }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B3 — get_contract_creation
  server.registerTool("get_contract_creation", {
    description: "Creator address and creation tx hash for up to 5 contracts.",
    inputSchema: z.object({ addresses: z.array(address).min(1).max(5), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("contract", "getcontractcreation", { contractaddresses: args.addresses.join(",") }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B4 — verify_source
  server.registerTool("verify_source", {
    description: "Submit Solidity source code for Etherscan verification. Returns a GUID; poll with check_verify_status.",
    inputSchema: z.object({
      contract_address:      address,
      source_code:           z.string(),
      code_format:           z.enum(["solidity-single-file", "solidity-standard-json-input"]),
      contract_name:         z.string(),
      compiler_version:      z.string(),
      optimization_used:     z.boolean().optional(),
      runs:                  z.number().int().optional(),
      constructor_arguments: z.string().optional(),
      evm_version:           z.string().optional(),
      license_type:          z.number().int().optional(),
      chain_id:              chainId,
    }),
  }, async (args) => {
    try {
      const guid = await es.post<string>("contract", "verifysourcecode", {
        contractaddress:      args.contract_address,
        sourceCode:           args.source_code,
        codeformat:           args.code_format,
        contractname:         args.contract_name,
        compilerversion:      args.compiler_version,
        optimizationUsed:     args.optimization_used ? "1" : "0",
        runs:                 args.runs ?? 200,
        constructorArguements: args.constructor_arguments ?? "",
        evmversion:           args.evm_version ?? "default",
        licenseType:          args.license_type ?? 1,
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ guid }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B5 — verify_vyper
  server.registerTool("verify_vyper", {
    description: "Submit Vyper source code for Etherscan verification.",
    inputSchema: z.object({
      contract_address:      address,
      source_code:           z.string(),
      code_format:           z.enum(["solidity-single-file", "solidity-standard-json-input"]),
      contract_name:         z.string(),
      compiler_version:      z.string(),
      optimization_used:     z.boolean().optional(),
      runs:                  z.number().int().optional(),
      constructor_arguments: z.string().optional(),
      license_type:          z.number().int().optional(),
      chain_id:              chainId,
    }),
  }, async (args) => {
    try {
      const guid = await es.post<string>("contract", "verifyvyper", {
        contractaddress:      args.contract_address,
        sourceCode:           args.source_code,
        codeformat:           args.code_format,
        contractname:         args.contract_name,
        compilerversion:      args.compiler_version,
        optimizationUsed:     args.optimization_used ? "1" : "0",
        runs:                 args.runs ?? 200,
        constructorArguements: args.constructor_arguments ?? "",
        licenseType:          args.license_type ?? 1,
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ guid }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B6 — check_verify_status
  server.registerTool("check_verify_status", {
    description: "Poll a verification job by GUID returned from verify_source or verify_vyper.",
    inputSchema: z.object({ guid: z.string(), chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<string>("contract", "checkverifystatus", { guid: args.guid }, args.chain_id);
      const status = raw.toLowerCase().includes("pass") ? "pass"
        : raw.toLowerCase().includes("fail") ? "fail" : "pending";
      return { content: [{ type: "text" as const, text: JSON.stringify({ status, message: raw }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B7 — verify_proxy
  server.registerTool("verify_proxy", {
    description: "Verify that a proxy contract points to the expected implementation.",
    inputSchema: z.object({
      contract_address:         address,
      expected_implementation:  address.optional(),
      chain_id:                 chainId,
    }),
  }, async (args) => {
    try {
      const guid = await es.post<string>("contract", "verifyproxycontract", {
        address: args.contract_address,
        ...(args.expected_implementation ? { expectedimplementation: args.expected_implementation } : {}),
      }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ guid }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B8 — check_proxy_verification
  server.registerTool("check_proxy_verification", {
    description: "Poll proxy verification status.",
    inputSchema: z.object({ contract_address: address, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object>("contract", "checkproxyverification", { address: args.contract_address }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B9 — get_bytecode
  server.registerTool("get_bytecode", {
    description: "Raw deployed bytecode for any address.",
    inputSchema: z.object({ address, tag: z.string().optional(), chain_id: chainId }),
  }, async (args) => {
    try {
      const bytecode = await es.get<string>("proxy", "eth_getCode", { address: args.address, tag: args.tag ?? "latest" }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify({ address: args.address, bytecode, is_contract: bytecode !== "0x" }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // B10 — sourcify_submit
  server.registerTool("sourcify_submit", {
    description: "Submit a contract for verification on Sourcify. Uploads source files and compiler metadata.",
    inputSchema: z.object({
      chain_id:         z.number().int().positive().describe("EVM chain ID (e.g. 1 for Ethereum mainnet)"),
      contract_address: address,
      files:            z.record(z.string()).describe("Map of filename → file content (must include metadata.json)"),
    }),
  }, async (args) => {
    try {
      const formData = new FormData();
      formData.append("address", args.contract_address);
      formData.append("chain",   String(args.chain_id));

      for (const [name, content] of Object.entries(args.files)) {
        formData.append("files", new Blob([content], { type: "text/plain" }), name);
      }

      const res = await fetch("https://sourcify.dev/server/verify", {
        method: "POST",
        body:   formData,
      });

      const body = await res.json() as object;
      if (!res.ok) {
        return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("SOURCIFY_ERROR", body)) }], isError: true };
      }
      return { content: [{ type: "text" as const, text: JSON.stringify(body, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("SOURCIFY_ERROR", err)) }], isError: true };
    }
  });

  // B11 — get_similar_contracts
  server.registerTool("get_similar_contracts", {
    description: "Find contracts on Etherscan with bytecode similar to the given address.",
    inputSchema: z.object({ address, chain_id: chainId }),
  }, async (args) => {
    try {
      const raw = await es.get<object[]>("contract", "getsimilarcode", { address: args.address }, args.chain_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(raw, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
