import fs from "node:fs/promises";
import path from "node:path";
import { createTwoFilesPatch } from "diff";
import { ErrorCode } from "../errors.js";
import type { RemixdManager } from "./manager.js";

export class FSClient {
  private root:     string;
  private readOnly: boolean;
  private remixd:   RemixdManager | undefined;

  constructor(rootFolder: string, readOnly = false, remixd?: RemixdManager) {
    this.root     = path.resolve(rootFolder);
    this.readOnly = readOnly;
    this.remixd   = remixd;
  }

  updateRoot(folder: string, readOnly?: boolean): void {
    this.root     = path.resolve(folder);
    if (readOnly !== undefined) this.readOnly = readOnly;
  }

  private safe(relPath: string): string {
    const abs = path.resolve(this.root, relPath);
    if (!abs.startsWith(this.root + path.sep) && abs !== this.root) {
      throw Object.assign(
        new Error(`Path traversal detected: "${relPath}" escapes workspace root`),
        { code: ErrorCode.PATH_TRAVERSAL }
      );
    }
    return abs;
  }

  private assertWritable(): void {
    if (this.readOnly) {
      throw Object.assign(new Error("Workspace is in read-only mode"), { code: ErrorCode.READ_ONLY_MODE });
    }
  }

  /** Returns the WS client when remixd is running with an active connection. */
  private get ws() { return this.remixd?.filesystemWS ?? null; }

  // ── list ────────────────────────────────────────────────────────────────────
  // Always use direct fs: remixd's list() returns a flat { path: isBinary } map
  // whereas our tool contract exposes a rich tree.
  async list(relPath = ".", maxDepth = Infinity): Promise<TreeNode> {
    const abs = this.safe(relPath);
    return this.buildTree(abs, relPath, 0, maxDepth);
  }

  private async buildTree(abs: string, rel: string, depth: number, maxDepth: number): Promise<TreeNode> {
    const stat = await fs.stat(abs);
    if (!stat.isDirectory()) return { name: path.basename(abs), path: rel, type: "file" };
    const node: TreeNode = { name: path.basename(abs) || ".", path: rel, type: "directory", children: [] };
    if (depth >= maxDepth) return node;
    const entries = await fs.readdir(abs, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".") && e.name !== ".gitignore") continue;
      node.children!.push(await this.buildTree(
        path.join(abs, e.name), path.join(rel, e.name), depth + 1, maxDepth,
      ));
    }
    return node;
  }

  // ── read ────────────────────────────────────────────────────────────────────
  async read(relPath: string): Promise<{ path: string; content: string; sizeBytes: number }> {
    this.safe(relPath); // validate path
    const ws = this.ws;
    if (ws) {
      try {
        const r = await ws.call<{ content: string; readonly: boolean }>("get", { path: relPath });
        return { path: relPath, content: r.content, sizeBytes: Buffer.byteLength(r.content) };
      } catch { /* fall through to direct fs */ }
    }
    const abs = this.safe(relPath);
    try {
      const content = await fs.readFile(abs, "utf8");
      return { path: relPath, content, sizeBytes: Buffer.byteLength(content) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw Object.assign(new Error(`File not found: ${relPath}`), { code: ErrorCode.FILE_NOT_FOUND });
      }
      throw err;
    }
  }

  // ── write ───────────────────────────────────────────────────────────────────
  async write(relPath: string, content: string): Promise<{ path: string; written: boolean; sizeBytes: number }> {
    this.assertWritable();
    this.safe(relPath); // validate path
    const ws = this.ws;
    if (ws) {
      try {
        await ws.call("set", { path: relPath, content });
        return { path: relPath, written: true, sizeBytes: Buffer.byteLength(content) };
      } catch { /* fall through */ }
    }
    const abs = this.safe(relPath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, content, "utf8");
    return { path: relPath, written: true, sizeBytes: Buffer.byteLength(content) };
  }

  // ── exists ──────────────────────────────────────────────────────────────────
  async exists(relPath: string): Promise<boolean> {
    this.safe(relPath);
    const ws = this.ws;
    if (ws) {
      try { return await ws.call<boolean>("exists", { path: relPath }); } catch { /* fall through */ }
    }
    try { await fs.access(this.safe(relPath)); return true; } catch { return false; }
  }

  // ── isFile ──────────────────────────────────────────────────────────────────
  async isFile(relPath: string): Promise<boolean> {
    this.safe(relPath);
    const ws = this.ws;
    if (ws) {
      try { return await ws.call<boolean>("isFile", { path: relPath }); } catch { /* fall through */ }
    }
    try { return (await fs.stat(this.safe(relPath))).isFile(); } catch { return false; }
  }

  // ── isDirectory ─────────────────────────────────────────────────────────────
  async isDirectory(relPath: string): Promise<boolean> {
    this.safe(relPath);
    const ws = this.ws;
    if (ws) {
      try { return await ws.call<boolean>("isDirectory", { path: relPath }); } catch { /* fall through */ }
    }
    try { return (await fs.stat(this.safe(relPath))).isDirectory(); } catch { return false; }
  }

  // ── createDir ───────────────────────────────────────────────────────────────
  async createDir(relPath: string): Promise<{ path: string; created: boolean }> {
    this.assertWritable();
    this.safe(relPath);
    const ws = this.ws;
    if (ws) {
      try {
        await ws.call("createDir", { path: relPath });
        return { path: relPath, created: true };
      } catch { /* fall through */ }
    }
    await fs.mkdir(this.safe(relPath), { recursive: true });
    return { path: relPath, created: true };
  }

  // ── rename ──────────────────────────────────────────────────────────────────
  async rename(oldPath: string, newPath: string): Promise<{ success: boolean }> {
    this.assertWritable();
    this.safe(oldPath); this.safe(newPath);
    const ws = this.ws;
    if (ws) {
      try {
        await ws.call("rename", { oldPath, newPath });
        return { success: true };
      } catch { /* fall through */ }
    }
    await fs.rename(this.safe(oldPath), this.safe(newPath));
    return { success: true };
  }

  // ── remove ──────────────────────────────────────────────────────────────────
  async remove(relPath: string, confirm: boolean): Promise<{ path: string; removed: boolean }> {
    this.assertWritable();
    if (!confirm) throw new Error("confirm must be true to delete");
    this.safe(relPath);
    const ws = this.ws;
    if (ws) {
      try {
        await ws.call("remove", { path: relPath });
        return { path: relPath, removed: true };
      } catch { /* fall through */ }
    }
    await fs.rm(this.safe(relPath), { recursive: true, force: true });
    return { path: relPath, removed: true };
  }

  // ── stat ────────────────────────────────────────────────────────────────────
  async stat(relPath: string): Promise<{ path: string; type: "file" | "directory"; sizeBytes: number; mtimeMs: number }> {
    const abs = this.safe(relPath);
    try {
      const s = await fs.stat(abs);
      return { path: relPath, type: s.isDirectory() ? "directory" : "file", sizeBytes: s.size, mtimeMs: s.mtimeMs };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        throw Object.assign(new Error(`Path not found: ${relPath}`), { code: ErrorCode.FILE_NOT_FOUND });
      }
      throw err;
    }
  }

  // ── copy ────────────────────────────────────────────────────────────────────
  async copy(srcPath: string, destPath: string): Promise<{ src: string; dest: string; copied: boolean }> {
    this.assertWritable();
    const srcAbs  = this.safe(srcPath);
    const destAbs = this.safe(destPath);
    await fs.mkdir(path.dirname(destAbs), { recursive: true });
    await fs.cp(srcAbs, destAbs, { recursive: true });
    return { src: srcPath, dest: destPath, copied: true };
  }

  // ── search ──────────────────────────────────────────────────────────────────
  async search(
    pattern: string,
    relPath = ".",
    useRegex = false,
    fileGlob?: string,
  ): Promise<{ file: string; line: number; content: string }[]> {
    const abs    = this.safe(relPath);
    const regex  = useRegex ? new RegExp(pattern) : null;
    const globRe = fileGlob ? FSClient.buildGlobRe(fileGlob) : null;
    const results: { file: string; line: number; content: string }[] = [];
    await this.searchDir(abs, relPath, regex, pattern, fileGlob ?? null, results, globRe);
    return results;
  }

  private static buildGlobRe(glob: string): RegExp {
    // Normalize: bare ".ext" → "*.ext" for convenience
    let g = glob;
    if (!g.includes("*") && !g.includes("?") && g.startsWith(".")) g = "*" + g;
    const escaped = g
      .replace(/[.+^${}()|[\]\\]/g, "\\$&") // escape regex special chars (not * or ?)
      .replace(/\*\*/g, "\x00")             // protect ** before replacing *
      .replace(/\*/g, "[^/]*")              // * matches within a single path segment
      .replace(/\?/g, "[^/]")              // ? matches a single non-separator char
      .replace(/\x00/g, ".*");             // ** matches across path separators
    return new RegExp(`^${escaped}$`, "i");
  }

  private async searchDir(
    abs: string,
    rel: string,
    regex: RegExp | null,
    literal: string,
    fileGlob: string | null,
    out: { file: string; line: number; content: string }[],
    globRe: RegExp | null,
  ): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try { entries = await fs.readdir(abs, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childAbs = path.join(abs, e.name);
      const childRel = path.join(rel, e.name);
      if (e.isDirectory()) {
        await this.searchDir(childAbs, childRel, regex, literal, fileGlob, out, globRe);
      } else if (e.isFile()) {
        if (globRe) {
          const testTarget = fileGlob!.includes("/") ? childRel : e.name;
          if (!globRe.test(testTarget)) continue;
        }
        let text: string;
        try { text = await fs.readFile(childAbs, "utf8"); } catch { continue; }
        const lines = text.split("\n");
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i]!;
          const match = regex ? regex.test(line) : line.includes(literal);
          if (match) out.push({ file: childRel, line: i + 1, content: line });
        }
      }
    }
  }

  async diff(srcPath: string, destPath: string): Promise<{ src: string; dest: string; patch: string; hunks: number }> {
    const srcAbs  = this.safe(srcPath);
    const destAbs = this.safe(destPath);

    const [srcText, destText] = await Promise.all([
      fs.readFile(srcAbs,  "utf8").catch(() => ""),
      fs.readFile(destAbs, "utf8").catch(() => ""),
    ]);

    const patch = createTwoFilesPatch(srcPath, destPath, srcText, destText);
    const hunks = (patch.match(/^@@/gm) ?? []).length;
    return { src: srcPath, dest: destPath, patch, hunks };
  }

  get rootPath(): string { return this.root; }
}

export interface TreeNode {
  name:      string;
  path:      string;
  type:      "file" | "directory";
  children?: TreeNode[];
}
