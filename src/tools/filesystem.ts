import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FSClient } from "../remixd/fs.js";
import { mcpError } from "../errors.js";

export function registerFilesystem(server: McpServer, fsc: FSClient): void {

  // L1 — fs_list
  server.registerTool("fs_list", {
    description: "Directory tree of the remixd shared workspace. Paths are relative to the workspace root.",
    inputSchema: z.object({
      path:      z.string().optional(),
      max_depth: z.number().int().positive().optional(),
    }),
  }, async (args) => {
    try {
      const tree = await fsc.list(args.path ?? ".", args.max_depth ?? Infinity);
      return { content: [{ type: "text" as const, text: JSON.stringify(tree, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("FILE_NOT_FOUND", err)) }], isError: true };
    }
  });

  // L2 — fs_read
  server.registerTool("fs_read", {
    description: "Read a file's content from the workspace. Files larger than 500 KB include a size warning.",
    inputSchema: z.object({
      path:      z.string(),
      max_bytes: z.number().int().positive().optional().describe("Truncate response if file exceeds this size (default: no limit, but warns at 500 KB)"),
    }),
  }, async (args) => {
    try {
      const result = await fsc.read(args.path);
      const SIZE_WARN = 500_000;
      const limit = args.max_bytes;
      let content = result.content;
      let truncated = false;
      if (limit && result.sizeBytes > limit) {
        content = content.slice(0, limit);
        truncated = true;
      }
      const out = { ...result, content, truncated, size_warning: result.sizeBytes > SIZE_WARN ? `File is ${(result.sizeBytes / 1024).toFixed(0)} KB — may exceed LLM context` : undefined };
      return { content: [{ type: "text" as const, text: JSON.stringify(out, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("FILE_NOT_FOUND", err)) }], isError: true };
    }
  });

  // L3 — fs_write
  server.registerTool("fs_write", {
    description: "Write content to a file. Creates parent directories. Blocked in read-only mode.",
    inputSchema: z.object({ path: z.string(), content: z.string() }),
  }, async (args) => {
    try {
      const result = await fsc.write(args.path, args.content);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const code = (err as { code?: string }).code === "READ_ONLY_MODE" ? "READ_ONLY_MODE" : "FILE_NOT_FOUND";
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError(code, err)) }], isError: true };
    }
  });

  // L4 — fs_exists
  server.registerTool("fs_exists", {
    description: "Check if a path exists in the workspace.",
    inputSchema: z.object({ path: z.string() }),
  }, async (args) => {
    try {
      const exists = await fsc.exists(args.path);
      return { content: [{ type: "text" as const, text: JSON.stringify({ path: args.path, exists }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("FILE_NOT_FOUND", err)) }], isError: true };
    }
  });

  // L5 — fs_is_file
  server.registerTool("fs_is_file", {
    description: "True if the path is a regular file.",
    inputSchema: z.object({ path: z.string() }),
  }, async (args) => {
    try {
      const isFile = await fsc.isFile(args.path);
      return { content: [{ type: "text" as const, text: JSON.stringify({ path: args.path, is_file: isFile }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("FILE_NOT_FOUND", err)) }], isError: true };
    }
  });

  // L6 — fs_is_directory
  server.registerTool("fs_is_directory", {
    description: "True if the path is a directory.",
    inputSchema: z.object({ path: z.string() }),
  }, async (args) => {
    try {
      const isDir = await fsc.isDirectory(args.path);
      return { content: [{ type: "text" as const, text: JSON.stringify({ path: args.path, is_directory: isDir }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("FILE_NOT_FOUND", err)) }], isError: true };
    }
  });

  // L7 — fs_create_dir
  server.registerTool("fs_create_dir", {
    description: "Create a directory (recursive). Blocked in read-only mode.",
    inputSchema: z.object({ path: z.string() }),
  }, async (args) => {
    try {
      const result = await fsc.createDir(args.path);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("READ_ONLY_MODE", err)) }], isError: true };
    }
  });

  // L8 — fs_rename
  server.registerTool("fs_rename", {
    description: "Rename or move a file or directory. Blocked in read-only mode.",
    inputSchema: z.object({ old_path: z.string(), new_path: z.string() }),
  }, async (args) => {
    try {
      const result = await fsc.rename(args.old_path, args.new_path);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("READ_ONLY_MODE", err)) }], isError: true };
    }
  });

  // L10 — fs_search
  server.registerTool("fs_search", {
    description: "Search workspace files for a string or regex pattern. Returns matching lines with file path and line number.",
    inputSchema: z.object({
      pattern:   z.string().describe("Search string or regex pattern"),
      path:      z.string().optional().describe("Directory to search in (default: workspace root)"),
      use_regex: z.boolean().optional().describe("Treat pattern as a regular expression"),
      file_glob: z.string().optional().describe("Filter files by extension suffix, e.g. '.sol' or '.ts'"),
    }),
  }, async (args) => {
    try {
      const results = await fsc.search(args.pattern, args.path ?? ".", args.use_regex ?? false, args.file_glob);
      return { content: [{ type: "text" as const, text: JSON.stringify({ count: results.length, matches: results }, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("FILE_NOT_FOUND", err)) }], isError: true };
    }
  });

  // L11 — fs_stat
  server.registerTool("fs_stat", {
    description: "Stat a path: type (file or directory), size in bytes, and last-modified timestamp.",
    inputSchema: z.object({ path: z.string() }),
  }, async (args) => {
    try {
      const result = await fsc.stat(args.path);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("FILE_NOT_FOUND", err)) }], isError: true };
    }
  });

  // L12 — fs_copy
  server.registerTool("fs_copy", {
    description: "Copy a file or directory recursively to a new path. Creates parent directories. Blocked in read-only mode.",
    inputSchema: z.object({ src: z.string(), dest: z.string() }),
  }, async (args) => {
    try {
      const result = await fsc.copy(args.src, args.dest);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      const code = (err as { code?: string }).code === "READ_ONLY_MODE" ? "READ_ONLY_MODE" : "FILE_NOT_FOUND";
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError(code, err)) }], isError: true };
    }
  });

  // L9 — fs_remove
  server.registerTool("fs_remove", {
    description: "Delete a file or directory recursively. Requires confirm: true. Blocked in read-only mode.",
    inputSchema: z.object({ path: z.string(), confirm: z.literal(true) }),
  }, async (args) => {
    try {
      const result = await fsc.remove(args.path, args.confirm);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("READ_ONLY_MODE", err)) }], isError: true };
    }
  });

  // L13 — fs_diff
  server.registerTool("fs_diff", {
    description: "Generate a unified diff between two files in the workspace. Returns the patch text and hunk count.",
    inputSchema: z.object({
      src:  z.string().describe("Source file path (relative to workspace)"),
      dest: z.string().describe("Destination file path (relative to workspace)"),
    }),
  }, async (args) => {
    try {
      const result = await fsc.diff(args.src, args.dest);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("FILE_NOT_FOUND", err)) }], isError: true };
    }
  });
}
