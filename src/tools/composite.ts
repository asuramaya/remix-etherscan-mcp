import { z } from "zod";
import { createTwoFilesPatch } from "diff";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import type { RemixdManager } from "../remixd/manager.js";
import type { FSClient } from "../remixd/fs.js";
import { fetchSourceFromSourcify } from "../etherscan/sourcify.js";
import { decodeCalldata, decodeLog, serialise } from "../abi/codec.js";
import { getCursor, setCursor, resetCursor } from "../state/cursors.js";
import { getStore, TTL }                      from "../db/store.js";
import { mcpError } from "../errors.js";
import { address, txHash, chainId } from "./schemas.js";

interface EtherscanSourceResult {
  SourceCode:       string;
  ABI:              string;
  ContractName:     string;
  CompilerVersion:  string;
  ConstructorArguments: string;
}

function parseSourceFiles(raw: EtherscanSourceResult): Record<string, string> {
  const src = raw.SourceCode ?? "";
  if (src.startsWith("{{")) {
    try {
      const inner = JSON.parse(src.slice(1, -1)) as { sources: Record<string, { content: string }> };
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(inner.sources)) out[k] = v.content;
      return out;
    } catch { /* fall through */ }
  }
  if (src.startsWith("{")) {
    try {
      const inner = JSON.parse(src) as { sources: Record<string, { content: string }> };
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(inner.sources)) out[k] = v.content;
      return out;
    } catch { /* fall through */ }
  }
  return { [`${raw.ContractName || "contract"}.sol`]: src };
}

type SourceResult = { files: Record<string, string>; abi: string; name: string; compilerVersion: string; origin: "etherscan" | "sourcify" };

async function fetchSource(
  es:   EtherscanClient,
  addr: string,
  cid:  number,
): Promise<SourceResult> {
  const cacheKey = `${cid}:${addr.toLowerCase()}`;
  const cached = getStore().ns("source").get<SourceResult>(cacheKey);
  if (cached) return cached;

  const rows = await es.get<EtherscanSourceResult[]>("contract", "getsourcecode", { address: addr }, cid);
  const row = rows[0];
  if (row?.SourceCode) {
    const result: SourceResult = { files: parseSourceFiles(row), abi: row.ABI, name: row.ContractName, compilerVersion: row.CompilerVersion, origin: "etherscan" };
    getStore().ns("source").set(cacheKey, result, TTL.SOURCE);
    return result;
  }
  const sf = await fetchSourceFromSourcify(cid, addr);
  if (sf) {
    const result: SourceResult = { files: sf, abi: "", name: addr, compilerVersion: "", origin: "sourcify" };
    getStore().ns("source").set(cacheKey, result, TTL.SOURCE);
    return result;
  }
  throw new Error(`No verified source for ${addr} on chain ${cid}`);
}

export function registerComposite(server: McpServer, es: EtherscanClient, remixd: RemixdManager, fsc: FSClient): void {

  // O1 — fetch_and_open
  server.registerTool("fetch_and_open", {
    description: "Fetch verified source for an address, write all files to the remixd workspace, and optionally start remixd. One-shot shortcut for auditing.",
    inputSchema: z.object({
      address,
      chain_id:          chainId,
      workspace_subdir:  z.string().optional(),
      start_remixd:      z.boolean().optional(),
      overwrite:         z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;
      const overwrite = args.overwrite ?? true;
      const { files, abi, name, compilerVersion, origin } = await fetchSource(es, args.address, cid);
      const base = args.workspace_subdir ?? name;
      const written: string[] = [];
      const skipped: string[] = [];

      for (const [filename, content] of Object.entries(files)) {
        const dest = `${base}/${filename}`;
        if (!overwrite && await fsc.exists(dest)) { skipped.push(dest); continue; }
        await fsc.write(dest, content);
        written.push(dest);
      }
      if (abi && abi !== "Contract source code not verified") {
        try {
          const dest = `${base}/abi.json`;
          if (overwrite || !await fsc.exists(dest)) {
            await fsc.write(dest, JSON.stringify(JSON.parse(abi), null, 2));
            written.push(dest);
          }
        } catch { /* non-JSON ABI */ }
      }

      let remixdStatus: object | null = null;
      if (args.start_remixd !== false) {
        try { remixdStatus = remixd.start(); } catch { remixdStatus = remixd.status(); }
      }

      const wsPath = remixd.sharedFolder;
      return { content: [{ type: "text" as const, text: JSON.stringify({
        contract_name:    name,
        compiler_version: compilerVersion,
        source:           origin,
        address:          args.address,
        chain_id:         cid,
        files_written:    written,
        files_skipped:    skipped,
        workspace_path:   `${wsPath}/${base}`,
        remixd_url:       "ws://127.0.0.1:65520",
        remix_ide_url:    `https://remix.ethereum.org/#activate=remixd`,
        remixd:           remixdStatus,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // O2 — diff_contracts
  server.registerTool("diff_contracts", {
    description: "Fetch verified source for two addresses and return a unified diff of every changed file. Useful for comparing proxy implementations or fork divergences.",
    inputSchema: z.object({
      address_a:     address,
      address_b:     address,
      chain_id_a:    chainId,
      chain_id_b:    chainId,
      context_lines: z.number().int().nonnegative().optional(),
    }),
  }, async (args) => {
    try {
      const cidA = args.chain_id_a ?? 1;
      const cidB = args.chain_id_b ?? cidA;
      const ctx  = args.context_lines ?? 3;
      const [srcA, srcB] = await Promise.all([
        fetchSource(es, args.address_a, cidA),
        fetchSource(es, args.address_b, cidB),
      ]);
      const keysA = new Set(Object.keys(srcA.files));
      const keysB = new Set(Object.keys(srcB.files));
      const allFiles = new Set([...keysA, ...keysB]);

      const rawOnlyInA: string[] = [];
      const rawOnlyInB: string[] = [];
      const filesIdentical: string[] = [];
      const filesChanged: Array<{ path: string; diff: string }> = [];

      for (const f of allFiles) {
        const inA = keysA.has(f), inB = keysB.has(f);
        if (inA && !inB) { rawOnlyInA.push(f); continue; }
        if (!inA && inB) { rawOnlyInB.push(f); continue; }
        const a = srcA.files[f]!;
        const b = srcB.files[f]!;
        if (a === b) { filesIdentical.push(f); continue; }
        filesChanged.push({ path: f, diff: createTwoFilesPatch(`a/${f}`, `b/${f}`, a, b, "", "", { context: ctx }) });
      }

      // Detect renames: A-only file with identical content to a B-only file
      const renamedFiles: Array<{ from: string; to: string }> = [];
      const filesOnlyInA: string[] = [];
      const filesOnlyInB: string[] = [];
      const bOnlyByContent = new Map<string, string>(); // content hash → filename in B
      for (const f of rawOnlyInB) bOnlyByContent.set(srcB.files[f]!, f);
      for (const f of rawOnlyInA) {
        const bMatch = bOnlyByContent.get(srcA.files[f]!);
        if (bMatch !== undefined) {
          renamedFiles.push({ from: f, to: bMatch });
          bOnlyByContent.delete(srcA.files[f]!);
        } else {
          filesOnlyInA.push(f);
        }
      }
      filesOnlyInB.push(...bOnlyByContent.values());

      const summary = {
        changed_files: filesChanged.length,
        renamed_files: renamedFiles.length,
        only_in_a:     filesOnlyInA.length,
        only_in_b:     filesOnlyInB.length,
        identical:     filesIdentical.length,
      };

      return { content: [{ type: "text" as const, text: JSON.stringify({
        name_a: srcA.name, address_a: args.address_a,
        name_b: srcB.name, address_b: args.address_b,
        files_renamed:   renamedFiles,
        files_only_in_a: filesOnlyInA,
        files_only_in_b: filesOnlyInB,
        files_changed:   filesChanged,
        files_identical: filesIdentical,
        summary,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // O3 — decode_transaction
  server.registerTool("decode_transaction", {
    description: "Fetch a transaction and its receipt, decode calldata and all emitted events using the contract ABI. Returns a clean human-readable summary.",
    inputSchema: z.object({
      tx_hash:  txHash,
      chain_id: chainId,
      abi:      z.array(z.record(z.unknown())).optional().describe("ABI fragment array. If omitted, fetched from Etherscan for the target contract."),
    }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;
      type RawTx = { to?: string; input?: string; value?: string; blockNumber?: string; from?: string; hash?: string };
      type RawReceipt = { status?: string; gasUsed?: string; logs?: Array<{ address: string; topics: string[]; data: string; logIndex: string }> };
      type InternalTx = { from: string; to: string; value: string; type: string; isError: string };

      const [txRaw, receiptRaw] = await Promise.all([
        es.get<RawTx>("proxy", "eth_getTransactionByHash", { txhash: args.tx_hash }, cid),
        es.get<RawReceipt>("proxy", "eth_getTransactionReceipt", { txhash: args.tx_hash }, cid),
      ]);

      // Fetch block timestamp
      let timestamp: number | null = null;
      if (txRaw.blockNumber) {
        try {
          const blk = await es.get<{ timestamp?: string }>("proxy", "eth_getBlockByNumber", { tag: txRaw.blockNumber, boolean: "false" }, cid);
          timestamp = blk.timestamp ? parseInt(blk.timestamp, 16) : null;
        } catch { /* non-critical */ }
      }

      // Fetch internal calls
      let internalCalls: Array<{ from: string; to: string; value_eth: string; type: string }> = [];
      try {
        const internals = await es.get<InternalTx[]>("account", "txlistinternal", { txhash: args.tx_hash }, cid);
        internalCalls = internals.map(r => ({
          from:      r.from,
          to:        r.to,
          value_eth: (Number(BigInt(r.value || "0")) / 1e18).toFixed(6) + " ETH",
          type:      r.type,
        }));
      } catch { /* no internal txs or API error */ }

      let abiArr: object[] = args.abi ? (args.abi as object[]) : [];
      if (abiArr.length === 0 && txRaw.to) {
        try {
          const rows = await es.get<EtherscanSourceResult[]>("contract", "getsourcecode", { address: txRaw.to }, cid);
          if (rows[0]?.ABI && rows[0].ABI !== "Contract source code not verified") abiArr = JSON.parse(rows[0].ABI) as object[];
        } catch { /* unverified */ }
      }

      const valueWei  = txRaw.value ? BigInt(txRaw.value) : 0n;
      const valueEth  = (Number(valueWei) / 1e18).toFixed(6) + " ETH";
      const gasUsed   = receiptRaw?.gasUsed ? parseInt(receiptRaw.gasUsed, 16) : null;
      const status    = receiptRaw?.status === "0x1" ? "success" : receiptRaw?.status === "0x0" ? "fail" : "unknown";

      const decodedCall = txRaw.input && txRaw.input !== "0x" ? decodeCalldata(abiArr, txRaw.input) : null;
      const logs = receiptRaw?.logs ?? [];
      const events = logs.map((log) => {
        try {
          const decoded = decodeLog(abiArr, log.topics, log.data);
          return { address: log.address, log_index: parseInt(log.logIndex, 16), decoded };
        } catch {
          return { address: log.address, log_index: parseInt(log.logIndex || "0", 16), raw: log };
        }
      });

      return { content: [{ type: "text" as const, text: JSON.stringify(serialise({
        hash:           args.tx_hash,
        block_number:   txRaw.blockNumber ? parseInt(txRaw.blockNumber, 16) : null,
        timestamp,
        from:           txRaw.from,
        to:             txRaw.to,
        value_eth:      valueEth,
        status,
        gas_used:       gasUsed,
        function_call:  decodedCall,
        events,
        internal_calls: internalCalls,
      })) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // O4 — audit_setup
  server.registerTool("audit_setup", {
    description: "Full audit bootstrap: fetch source, write to workspace, start remixd, run Slither. Returns structured fetch, compile, and slither results.",
    inputSchema: z.object({
      address,
      chain_id:         chainId,
      workspace_subdir: z.string().optional(),
      run_slither:      z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execFileAsync = promisify(execFile);

      const cid = args.chain_id ?? 1;
      const { files, abi, name, compilerVersion, origin } = await fetchSource(es, args.address, cid);
      const base = args.workspace_subdir ?? name;
      const written: string[] = [];

      for (const [filename, content] of Object.entries(files)) {
        const dest = `${base}/${filename}`;
        await fsc.write(dest, content);
        written.push(dest);
      }
      if (abi && abi !== "Contract source code not verified") {
        try {
          await fsc.write(`${base}/abi.json`, JSON.stringify(JSON.parse(abi), null, 2));
          written.push(`${base}/abi.json`);
        } catch { /* non-JSON ABI */ }
      }

      let remixdStatus: object;
      try { remixdStatus = remixd.start(); } catch { remixdStatus = remixd.status(); }

      const fetchResult = {
        contract_name:    name,
        compiler_version: compilerVersion,
        source:           origin,
        files_written:    written,
        workspace_path:   `${remixd.sharedFolder}/${base}`,
        remixd_url:       "ws://127.0.0.1:65520",
        remix_ide_url:    `https://remix.ethereum.org/#activate=remixd`,
        remixd:           remixdStatus,
      };

      let slitherResult: object | null = null;
      if (args.run_slither !== false) {
        const cwd = remixd.sharedFolder;
        const slitherArgs = [base, "--json", "-", "--no-fail-pedantic"];
        type RunResult = { stdout?: string; stderr?: string; message?: string };
        const runResult: RunResult = await execFileAsync("slither", slitherArgs, { cwd, timeout: 120_000 }).catch(e => e as RunResult);
        const stdout = runResult.stdout;
        const stderr = runResult.stderr;

        if (!stdout && runResult.message?.includes("ENOENT")) {
          slitherResult = { available: false, error: "slither not installed — run: pip install slither-analyzer" };
        } else {
          let findings: object[] = [];
          const summary = { high: 0, medium: 0, low: 0, informational: 0, optimization: 0 };
          try {
            const parsed = JSON.parse(stdout ?? "") as { results?: { detectors?: Array<{ impact: string; confidence: string; description: string; check: string; elements: Array<{ source_mapping?: { filename_short?: string; lines?: number[] } }> }> } };
            const detectors = parsed.results?.detectors ?? [];
            findings = detectors.map(d => ({
              title: d.check, description: d.description, severity: d.impact, confidence: d.confidence,
              locations: d.elements?.map(el => ({ file: el.source_mapping?.filename_short ?? "", lines: el.source_mapping?.lines ?? [] })) ?? [],
            }));
            for (const f of detectors) {
              const s = f.impact.toLowerCase();
              if (s in summary) summary[s as keyof typeof summary]++;
            }
          } catch { /* slither not JSON */ }
          slitherResult = { available: true, findings, summary, stderr };
        }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({
        fetch_result:   fetchResult,
        slither_result: slitherResult,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // O5 — trace_eth_flow
  server.registerTool("trace_eth_flow", {
    description: "Walk all internal transactions for a tx hash and return a labelled ETH flow list with value in ETH. label_addresses=true enriches addresses with nametags (requires PRO API key).",
    inputSchema: z.object({
      tx_hash:          txHash,
      chain_id:         chainId,
      label_addresses:  z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;
      type InternalTx = { from: string; to: string; value: string; type: string; isError: string; errCode?: string };
      const rows = await es.get<InternalTx[]>("account", "txlistinternal", { txhash: args.tx_hash }, cid);

      // Collect unique addresses
      const addrSet = new Set<string>();
      for (const r of rows) { addrSet.add(r.from.toLowerCase()); addrSet.add(r.to.toLowerCase()); }

      // Fetch labels if requested (PRO; fail gracefully); 1h cache per address+chain
      const labels = new Map<string, string>();
      if (args.label_addresses !== false) {
        const labelNs = getStore().ns("label");
        await Promise.allSettled([...addrSet].map(async (a) => {
          try {
            const cacheKey = `${cid}:${a}`;
            const cached = labelNs.get<string>(cacheKey);
            if (cached) { labels.set(a, cached); return; }
            const raw = await es.get<{ nameTag?: string }>("account", "getaddresstag", { address: a }, cid);
            if (raw?.nameTag) { labels.set(a, raw.nameTag); labelNs.set(cacheKey, raw.nameTag, TTL.LABEL); }
          } catch { /* PRO gate or unknown */ }
        }));
      }

      // Infer address roles from flow position
      const firstSeen = new Map<string, string>(); // address → role
      for (const r of rows) {
        const f = r.from.toLowerCase(), t = r.to.toLowerCase();
        if (!firstSeen.has(f)) firstSeen.set(f, "sender");
        if (!firstSeen.has(t)) firstSeen.set(t, "recipient");
      }

      const flow = rows.map((r) => {
        const from = r.from.toLowerCase(), to = r.to.toLowerCase();
        return {
          from,       from_label: labels.get(from),
          to,         to_label:   labels.get(to),
          value_eth:  (Number(BigInt(r.value || "0")) / 1e18).toFixed(6) + " ETH",
          type:       r.type,
          ...(r.isError === "1" ? { error: r.errCode ?? "reverted" } : {}),
        };
      });

      const uniqueAddresses = [...addrSet].map(a => ({
        address: a,
        label:   labels.get(a),
        role:    firstSeen.get(a) ?? "participant",
      }));

      const total = rows.reduce((acc, r) => acc + BigInt(r.value || "0"), 0n);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        tx_hash:           args.tx_hash,
        total_eth_moved:   (Number(total) / 1e18).toFixed(6) + " ETH",
        flow,
        unique_addresses:  uniqueAddresses,
      }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // O6 — watch_events
  server.registerTool("watch_events", {
    description: "Stateful event poller. Call repeatedly to stream new logs since the last call. Cursor is stored per (address, chain, topic0). reset_cursor clears state.",
    inputSchema: z.object({
      address,
      chain_id:      chainId,
      topic0:        z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
      abi:           z.array(z.record(z.unknown())).optional().describe("ABI fragment array for decoding log events."),
      from_block:    z.number().int().nonnegative().optional(),
      max_blocks:    z.number().int().positive().optional().describe("Max blocks to scan per call (caps toBlock = fromBlock + max_blocks). Prevents huge scans on first call."),
      page_size:     z.number().int().positive().max(1000).optional(),
      reset_cursor:  z.boolean().optional(),
    }),
  }, async (args) => {
    try {
      const cid = args.chain_id ?? 1;
      const pageSize = args.page_size ?? 100;

      if (args.reset_cursor) resetCursor(args.address, cid, args.topic0);

      const storedCursor = getCursor(args.address, cid, args.topic0);
      const fromBlock = storedCursor ?? args.from_block ?? 0;
      const toBlock   = args.max_blocks !== undefined
        ? (fromBlock + args.max_blocks).toString()
        : "latest";

      type LogEntry = { blockNumber: string; transactionHash: string; topics: string[]; data: string; logIndex: string };
      const params: Record<string, string | number | boolean | undefined> = {
        address:   args.address,
        fromBlock: fromBlock.toString(),
        toBlock,
        page:      "1",
        offset:    pageSize.toString(),
      };
      if (args.topic0) params["topic0"] = args.topic0;

      const logs = await es.get<LogEntry[]>("logs", "getLogs", params, cid);

      if (logs.length > 0) {
        const last = logs[logs.length - 1]!;
        setCursor(args.address, cid, parseInt(last.blockNumber, 16) + 1, args.topic0);
      }

      const abiArr = (args.abi ?? []) as object[];
      const newLogs = logs.map((log) => {
        try { return { ...log, decoded: decodeLog(abiArr, log.topics, log.data) }; }
        catch { return log; }
      });

      const cursorBlock = logs.length > 0
        ? parseInt(logs[logs.length - 1]!.blockNumber, 16) + 1
        : fromBlock;

      return { content: [{ type: "text" as const, text: JSON.stringify(serialise({
        new_logs:     newLogs,
        cursor_block: cursorBlock,
        log_count:    newLogs.length,
      })) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });

  // O7 — get_events
  server.registerTool("get_events", {
    description: "Fetch and decode historical events for a contract over a block range. Paginates automatically and decodes logs against the provided ABI.",
    inputSchema: z.object({
      address,
      chain_id:   chainId,
      topic0:     z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional().describe("Event topic0 filter (keccak256 of event signature)"),
      from_block: z.number().int().nonnegative().describe("Start block (inclusive)"),
      to_block:   z.union([z.number().int().nonnegative(), z.literal("latest")]).optional().describe("End block (default: latest)"),
      abi:        z.array(z.record(z.unknown())).optional().describe("ABI to decode matching events"),
      page_size:  z.number().int().positive().max(1000).optional().describe("Logs per page (default 200, max 1000)"),
      max_pages:  z.number().int().positive().max(20).optional().describe("Maximum pages to fetch (default 5, max 20). Total logs = page_size × max_pages."),
    }),
  }, async (args) => {
    try {
      const cid      = args.chain_id ?? 1;
      const pageSize = args.page_size ?? 200;
      const maxPages = args.max_pages ?? 5;

      type LogEntry = { blockNumber: string; transactionHash: string; topics: string[]; data: string; logIndex: string; address: string };
      const allLogs: LogEntry[] = [];

      for (let page = 1; page <= maxPages; page++) {
        const params: Record<string, string | number | boolean | undefined> = {
          address:   args.address,
          fromBlock: args.from_block.toString(),
          toBlock:   (args.to_block ?? "latest").toString(),
          page:      page.toString(),
          offset:    pageSize.toString(),
        };
        if (args.topic0) params["topic0"] = args.topic0;

        const batch = await es.get<LogEntry[]>("logs", "getLogs", params, cid);
        allLogs.push(...batch);
        if (batch.length < pageSize) break; // last page
      }

      const abiArr = (args.abi ?? []) as object[];
      const decoded = allLogs.map(log => {
        try { return { ...log, decoded: decodeLog(abiArr, log.topics, log.data) }; }
        catch { return log; }
      });

      const blockMin = allLogs.length > 0 ? parseInt(allLogs[0]!.blockNumber, 16) : null;
      const blockMax = allLogs.length > 0 ? parseInt(allLogs[allLogs.length - 1]!.blockNumber, 16) : null;

      return { content: [{ type: "text" as const, text: JSON.stringify(serialise({
        log_count:   decoded.length,
        from_block:  args.from_block,
        to_block:    args.to_block ?? "latest",
        block_range: blockMin !== null ? { min: blockMin, max: blockMax } : null,
        logs:        decoded,
      })) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("ETHERSCAN_API_ERROR", err)) }], isError: true };
    }
  });
}
