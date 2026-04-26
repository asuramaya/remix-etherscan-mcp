import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RemixdManager } from "../remixd/manager.js";
import { mcpError } from "../errors.js";

const execFileAsync = promisify(execFile);
const TIMEOUT = 120_000;

interface ArtifactContract {
  abi:               object[];
  bytecode:          string;
  deployedBytecode:  string;
  sourceMap?:        string;
  ast?:              object;
}

async function readHardhatArtifacts(folder: string): Promise<Record<string, ArtifactContract>> {
  const artifactsDir = path.join(folder, "artifacts", "contracts");
  const contracts: Record<string, ArtifactContract> = {};
  try {
    const entries = await fs.readdir(artifactsDir, { recursive: true, withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json") || e.name.endsWith(".dbg.json")) continue;
      const raw = JSON.parse(await fs.readFile(path.join(e.parentPath ?? (e as unknown as { path: string }).path, e.name), "utf8")) as {
        contractName?: string; abi?: object[]; bytecode?: string; deployedBytecode?: string;
      };
      if (!raw.contractName || !raw.abi) continue;
      contracts[raw.contractName] = {
        abi:             raw.abi,
        bytecode:        raw.bytecode ?? "",
        deployedBytecode: raw.deployedBytecode ?? "",
      };
    }
  } catch { /* no artifacts yet */ }
  return contracts;
}

interface FoundryArtifactContract extends ArtifactContract {
  gasEstimates?: {
    creation?: { codeDepositCost?: string; executionCost?: string };
    external?:  Record<string, string>;
    internal?:  Record<string, string>;
  };
}

async function readTruffleArtifacts(folder: string): Promise<Record<string, ArtifactContract>> {
  const buildDir = path.join(folder, "build", "contracts");
  const contracts: Record<string, ArtifactContract> = {};
  try {
    const entries = await fs.readdir(buildDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json")) continue;
      const raw = JSON.parse(await fs.readFile(path.join(buildDir, e.name), "utf8")) as {
        contractName?: string; abi?: object[]; bytecode?: string; deployedBytecode?: string;
      };
      if (!raw.contractName || !raw.abi) continue;
      contracts[raw.contractName] = {
        abi:              raw.abi,
        bytecode:         raw.bytecode ?? "",
        deployedBytecode: raw.deployedBytecode ?? "",
      };
    }
  } catch { /* no build dir yet */ }
  return contracts;
}

async function readFoundryArtifacts(folder: string): Promise<Record<string, FoundryArtifactContract>> {
  const outDir = path.join(folder, "out");
  const contracts: Record<string, FoundryArtifactContract> = {};
  try {
    const entries = await fs.readdir(outDir, { recursive: true, withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile() || !e.name.endsWith(".json")) continue;
      const p = path.join(e.parentPath ?? (e as unknown as { path: string }).path, e.name);
      const raw = JSON.parse(await fs.readFile(p, "utf8")) as {
        abi?: object[];
        bytecode?: { object?: string };
        deployedBytecode?: { object?: string };
        gasEstimates?: {
          creation?: { codeDepositCost?: string; executionCost?: string };
          external?:  Record<string, string>;
          internal?:  Record<string, string>;
        };
      };
      if (!raw.abi) continue;
      const name = e.name.replace(".json", "");
      contracts[name] = {
        abi:             raw.abi,
        bytecode:        raw.bytecode?.object ?? "",
        deployedBytecode: raw.deployedBytecode?.object ?? "",
        gasEstimates:    raw.gasEstimates,
      };
    }
  } catch { /* no out dir */ }
  return contracts;
}

interface Diagnostic { severity: string; file?: string; line?: number; col?: number; message: string }

function parseErrors(stderr: string): Diagnostic[] {
  // Match Solc-style: "path/to/file.sol:10:5: Error: msg" or bare "Error: msg"
  const DIAG_RE = /^(?:(.+\.sol):(\d+):(\d+):\s+)?(Error|Warning)(?:\s+\([^)]+\))?:\s+(.+)$/;
  const out: Diagnostic[] = [];
  for (const line of stderr.split("\n")) {
    const m = DIAG_RE.exec(line.trim());
    if (!m) continue;
    out.push({
      severity: m[4]!.toLowerCase(),
      ...(m[1] ? { file: m[1], line: Number(m[2]), col: Number(m[3]) } : {}),
      message:  m[5]!,
    });
  }
  return out;
}

export function registerCompilation(server: McpServer, remixd: RemixdManager): void {

  // N1 — compile_hardhat
  server.registerTool("compile_hardhat", {
    description: "Run `npx hardhat compile` in the shared workspace. Requires hardhat.config.js/ts.",
    inputSchema: z.object({ config_path: z.string().optional(), force: z.boolean().optional() }),
  }, async (args) => {
    const cwd = remixd.sharedFolder;
    try {
      const hardhatArgs = ["hardhat", "compile", ...(args.force ? ["--force"] : [])];
      if (args.config_path) hardhatArgs.push("--config", args.config_path);
      const { stderr } = await execFileAsync("npx", hardhatArgs, { cwd, timeout: TIMEOUT });
      const contracts  = await readHardhatArtifacts(cwd);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: true, compiler_version: "hardhat", contracts,
        errors: parseErrors(stderr).filter(e => e.severity === "error"),
        warnings: parseErrors(stderr).filter(e => e.severity === "warning"),
      }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { stderr?: string; stdout?: string; message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("COMPILE_ERROR", e.message ?? err, { stderr: e.stderr })) }], isError: true };
    }
  });

  // N2 — compile_truffle
  server.registerTool("compile_truffle", {
    description: "Run Truffle compilation in the shared workspace. Requires truffle-config.js.",
    inputSchema: z.object({ config_path: z.string().optional(), force: z.boolean().optional() }),
  }, async (args) => {
    const cwd = remixd.sharedFolder;
    try {
      const truffleArgs = ["truffle", "compile", ...(args.force ? ["--all"] : [])];
      if (args.config_path) truffleArgs.push("--config", args.config_path);
      const { stderr } = await execFileAsync("npx", truffleArgs, { cwd, timeout: TIMEOUT });
      const contracts  = await readTruffleArtifacts(cwd);
      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: true, compiler_version: "truffle", contracts,
        errors: parseErrors(stderr).filter(e => e.severity === "error"),
        warnings: parseErrors(stderr).filter(e => e.severity === "warning"),
      }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("COMPILE_ERROR", e.message ?? err, { stderr: e.stderr })) }], isError: true };
    }
  });

  // N3 — compile_foundry
  server.registerTool("compile_foundry", {
    description: "Run `forge build` in the shared workspace. Requires foundry.toml.",
    inputSchema: z.object({ force: z.boolean().optional() }),
  }, async (args) => {
    const cwd = remixd.sharedFolder;
    try {
      const { stderr } = await execFileAsync("forge", ["build", ...(args.force ? ["--force"] : [])], { cwd, timeout: TIMEOUT });
      const artifacts  = await readFoundryArtifacts(cwd);
      // Separate gas_estimates from contract data for cleaner top-level shape
      const contracts: Record<string, ArtifactContract> = {};
      const gasEstimates: Record<string, FoundryArtifactContract["gasEstimates"]> = {};
      for (const [name, art] of Object.entries(artifacts)) {
        const { gasEstimates: ge, ...rest } = art;
        contracts[name] = rest;
        if (ge) gasEstimates[name] = ge;
      }
      return { content: [{ type: "text" as const, text: JSON.stringify({
        success: true, compiler_version: "forge", contracts, gas_estimates: gasEstimates,
        errors: parseErrors(stderr).filter(e => e.severity === "error"),
        warnings: parseErrors(stderr).filter(e => e.severity === "warning"),
      }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("COMPILE_ERROR", e.message ?? err, { stderr: e.stderr })) }], isError: true };
    }
  });

  // N4 — compile_slither
  server.registerTool("compile_slither", {
    description: "Run Slither static security analysis on the workspace. Returns structured findings by severity.",
    inputSchema: z.object({
      target:       z.string().optional(),
      solc_version: z.string().optional(),
      filter_paths: z.array(z.string()).optional(),
    }),
  }, async (args) => {
    const cwd = remixd.sharedFolder;
    try {
      const slitherArgs = [
        args.target ?? ".",
        "--json", "-",
        "--no-fail-pedantic",
        ...(args.solc_version ? ["--solc", args.solc_version] : []),
        ...(args.filter_paths?.length ? ["--filter-paths", args.filter_paths.join(",")] : []),
      ];
      const { stdout, stderr } = await execFileAsync("slither", slitherArgs, { cwd, timeout: TIMEOUT }).catch(e => e as { stdout: string; stderr: string });

      let findings: object[] = [];
      let summary = { high: 0, medium: 0, low: 0, informational: 0, optimization: 0 };
      try {
        const parsed = JSON.parse(stdout) as { results?: { detectors?: Array<{ impact: string; confidence: string; description: string; check: string; elements: Array<{ source_mapping?: { filename_short?: string; lines?: number[] } }> }> } };
        const detectors = parsed.results?.detectors ?? [];
        findings = detectors.map(d => ({
          title:       d.check,
          description: d.description,
          severity:    d.impact,
          confidence:  d.confidence,
          check:       d.check,
          locations:   d.elements?.map(el => ({
            file:  el.source_mapping?.filename_short ?? "",
            lines: el.source_mapping?.lines ?? [],
          })) ?? [],
        }));
        for (const f of detectors) {
          const s = f.impact.toLowerCase();
          if (s in summary) summary[s as keyof typeof summary]++;
        }
      } catch { /* slither didn't return JSON */ }

      return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, findings, summary, stderr }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("COMPILE_ERROR", e.message ?? err)) }], isError: true };
    }
  });

  // N5 — run_forge_test
  server.registerTool("run_forge_test", {
    description: "Run Forge tests in the workspace. Returns per-test pass/fail status and gas usage.",
    inputSchema: z.object({
      match_test:     z.string().optional().describe("Filter tests by name (passed to --match-test)"),
      match_contract: z.string().optional().describe("Filter by contract name (--match-contract)"),
      verbosity:      z.number().int().min(1).max(5).optional().describe("Verbosity level 1-5 (default 2)"),
    }),
  }, async (args) => {
    const cwd = remixd.sharedFolder;
    try {
      const forgeArgs = [
        "test",
        "--json",
        `-${"v".repeat(args.verbosity ?? 2)}`,
        ...(args.match_test     ? ["--match-test",     args.match_test]     : []),
        ...(args.match_contract ? ["--match-contract",  args.match_contract] : []),
      ];

      const { stdout, stderr } = await execFileAsync("forge", forgeArgs, { cwd, timeout: TIMEOUT })
        .catch(e => e as { stdout: string; stderr: string; code?: number });

      let suite: object = {};
      let passed = 0, failed = 0;
      try {
        const parsed = JSON.parse(stdout) as Record<string, { test_results?: Record<string, { status: string; gas?: number }> }>;
        for (const [, contract] of Object.entries(parsed)) {
          for (const [, result] of Object.entries(contract.test_results ?? {})) {
            if (result.status === "Success") passed++; else failed++;
          }
        }
        suite = parsed;
      } catch { /* non-JSON output */ }

      return { content: [{ type: "text" as const, text: JSON.stringify({ passed, failed, suite, stderr }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("TEST_ERROR", e.message ?? err)) }], isError: true };
    }
  });

  // N6 — run_hardhat_test
  server.registerTool("run_hardhat_test", {
    description: "Run Hardhat tests in the workspace using `npx hardhat test`.",
    inputSchema: z.object({
      test_files: z.array(z.string()).optional().describe("Specific test files to run (relative paths)"),
      grep:       z.string().optional().describe("Only run tests matching this string (--grep)"),
    }),
  }, async (args) => {
    const cwd = remixd.sharedFolder;
    try {
      const hardhatArgs = [
        "hardhat", "test",
        ...(args.grep       ? ["--grep", args.grep]          : []),
        ...(args.test_files ?? []),
      ];

      const { stdout, stderr } = await execFileAsync("npx", hardhatArgs, { cwd, timeout: TIMEOUT })
        .catch(e => e as { stdout: string; stderr: string; code?: number });

      const passMatch  = /(\d+) passing/i.exec(stdout + stderr);
      const failMatch  = /(\d+) failing/i.exec(stdout + stderr);
      const pendMatch  = /(\d+) pending/i.exec(stdout + stderr);

      return { content: [{ type: "text" as const, text: JSON.stringify({
        passed:  passMatch  ? parseInt(passMatch[1]!, 10)  : null,
        failed:  failMatch  ? parseInt(failMatch[1]!, 10)  : null,
        pending: pendMatch  ? parseInt(pendMatch[1]!, 10)  : null,
        output:  (stdout + stderr).trim(),
      }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("TEST_ERROR", e.message ?? err)) }], isError: true };
    }
  });

  // N7 — compile_vyper
  server.registerTool("compile_vyper", {
    description: "Compile a Vyper contract file using the `vyper` CLI. Returns ABI and bytecode.",
    inputSchema: z.object({
      file:    z.string().describe("Relative path to the .vy file in the workspace"),
      format:  z.enum(["abi", "bytecode", "abi,bytecode"]).optional().describe("Output format (default: abi,bytecode)"),
    }),
  }, async (args) => {
    const cwd = remixd.sharedFolder;
    try {
      const fmt   = args.format ?? "abi,bytecode";
      const parts = fmt.split(",").flatMap(f => ["-f", f.trim()]);

      const { stdout, stderr } = await execFileAsync("vyper", [...parts, args.file], { cwd, timeout: TIMEOUT })
        .catch(e => e as { stdout: string; stderr: string });

      if (stderr && !stdout) {
        const diags = stderr.split("\n").filter(Boolean).map(line => {
          const m = /^(.+):(\d+):(\d+): (\w+): (.+)$/.exec(line);
          return m ? { file: m[1], line: parseInt(m[2]!, 10), col: parseInt(m[3]!, 10), severity: m[4]!.toLowerCase(), message: m[5]! } : { message: line };
        });
        return { content: [{ type: "text" as const, text: JSON.stringify({ success: false, diagnostics: diags }) }], isError: true };
      }

      let abi: object[] | undefined;
      let bytecode: string | undefined;

      if (fmt.includes("abi")) {
        const m = /^\[.*\]$/m.exec(stdout);
        if (m) { try { abi = JSON.parse(m[0]) as object[]; } catch { /* ignore */ } }
      }
      if (fmt.includes("bytecode")) {
        const m = /0x[0-9a-fA-F]+/.exec(stdout);
        if (m) bytecode = m[0];
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ success: true, file: args.file, abi, bytecode, raw: stdout }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("COMPILE_ERROR", e.message ?? err)) }], isError: true };
    }
  });
}
