import { z } from "zod";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RemixdManager } from "../remixd/manager.js";
import { mcpError } from "../errors.js";

const execFileAsync = promisify(execFile);

// Only allow bare git commands — no shell operators, no newlines, no dangerous flags
// The 's' flag is intentionally NOT set so \n is not matched by [^\n]
const GIT_CMD_RE = /^git[ \t][^\n\r&|;><`$(){}[\]]*$/;

// Block flags that can execute arbitrary binaries or exfiltrate data
const DANGEROUS_FLAGS = [
  "--upload-pack", "--receive-pack", "--exec",
  "--local-port", "--proxy-command",
];

export function registerGit(server: McpServer, remixd: RemixdManager): void {

  // M1 — git_exec
  server.registerTool("git_exec", {
    description: "Execute a git command in the remixd shared folder. Shell operators (;, &&, |, >, etc.) are not allowed.",
    inputSchema: z.object({
      command: z.string()
        .regex(GIT_CMD_RE, "Only bare git commands allowed. No shell operators or newlines.")
        .refine(
          cmd => !DANGEROUS_FLAGS.some(f => cmd.includes(f)),
          "Command contains a dangerous flag that could execute arbitrary code."
        ),
    }),
  }, async (args) => {
    try {
      const parts  = args.command.trim().split(/\s+/);
      const gitArgs = parts.slice(1);
      const { stdout, stderr } = await execFileAsync("git", gitArgs, {
        cwd:     remixd.sharedFolder,
        timeout: 30_000,
      });
      return { content: [{ type: "text" as const, text: JSON.stringify({ command: args.command, stdout, stderr, exit_code: 0 }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { stdout?: string; stderr?: string; code?: number; message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify({
        command: args.command,
        stdout:  e.stdout ?? "",
        stderr:  e.stderr ?? e.message ?? String(err),
        exit_code: e.code ?? 1,
      }, null, 2) }] };
    }
  });

  // M2 — git_blame
  server.registerTool("git_blame", {
    description: "Structured line-by-line blame for a file. Returns author, commit hash, timestamp, and line content for each line.",
    inputSchema: z.object({
      file:       z.string().describe("File path relative to the workspace root"),
      start_line: z.number().int().positive().optional().describe("First line to annotate (1-based, inclusive)"),
      end_line:   z.number().int().positive().optional().describe("Last line to annotate (1-based, inclusive)"),
    }).superRefine((d, ctx) => {
      if (d.start_line !== undefined && d.end_line !== undefined && d.start_line > d.end_line) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "start_line must be ≤ end_line", path: ["start_line"] });
      }
    }),
  }, async (args) => {
    try {
      const gitArgs = ["blame", "--line-porcelain"];
      if (args.start_line !== undefined || args.end_line !== undefined) {
        const start = args.start_line ?? 1;
        const end   = args.end_line   ?? args.start_line!;
        gitArgs.push(`-L${start},${end}`);
      }
      gitArgs.push("--", args.file);

      const { stdout } = await execFileAsync("git", gitArgs, { cwd: remixd.sharedFolder, timeout: 30_000 });

      // Parse git blame --line-porcelain output into structured records
      interface BlameLine { line: number; commit: string; author: string; author_email: string; timestamp: number; summary: string; content: string }
      const lines: BlameLine[] = [];
      let cur: Partial<BlameLine> = {};

      for (const row of stdout.split("\n")) {
        if (!row) continue;
        const commitMatch = /^([0-9a-f]{40}) \d+ (\d+)/.exec(row);
        if (commitMatch) { cur = { commit: commitMatch[1], line: Number(commitMatch[2]) }; continue; }
        if (row.startsWith("author "))       { cur.author       = row.slice(7).trim();  continue; }
        if (row.startsWith("author-mail "))  { cur.author_email = row.slice(12).trim().replace(/[<>]/g, ""); continue; }
        if (row.startsWith("author-time "))  { cur.timestamp    = Number(row.slice(12)); continue; }
        if (row.startsWith("summary "))      { cur.summary      = row.slice(8).trim();  continue; }
        if (row.startsWith("\t")) {
          lines.push({
            line:         cur.line         ?? 0,
            commit:       cur.commit       ?? "",
            author:       cur.author       ?? "",
            author_email: cur.author_email ?? "",
            timestamp:    cur.timestamp    ?? 0,
            summary:      cur.summary      ?? "",
            content:      row.slice(1),
          });
          cur = {};
        }
      }

      return { content: [{ type: "text" as const, text: JSON.stringify({ file: args.file, line_count: lines.length, lines }, null, 2) }] };
    } catch (err: unknown) {
      const e = err as { stderr?: string; message?: string };
      return { content: [{ type: "text" as const, text: JSON.stringify({ error: true, message: e.stderr ?? e.message ?? String(err) }, null, 2) }], isError: true };
    }
  });
}
