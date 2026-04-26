import fs   from "node:fs";
import path from "node:path";

interface Entry {
  value:       unknown;
  expiresAt?:  number; // Unix ms; absent = permanent
}

export class PersistentStore {
  private readonly data  = new Map<string, Entry>();
  private readonly file:   string;
  private          dirty   = false;
  private          pending = false;

  constructor(filePath: string) {
    this.file = filePath;
    this.load();
    // Synchronous flush on normal process exit (covers process.exit() calls)
    process.on("exit", () => this.flushSync());
  }

  // ── Persistence ─────────────────────────────────────────────────────────────

  private load(): void {
    try {
      const raw = fs.readFileSync(this.file, "utf8");
      const obj = JSON.parse(raw) as Record<string, Entry>;
      const now = Date.now();
      for (const [k, v] of Object.entries(obj)) {
        if (!v.expiresAt || v.expiresAt > now) this.data.set(k, v);
      }
    } catch { /* first run or corrupt file — start fresh */ }
  }

  flushSync(): void {
    if (!this.dirty) return;
    try {
      const dir = path.dirname(this.file);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      const now = Date.now();
      const obj: Record<string, Entry> = {};
      for (const [k, v] of this.data.entries()) {
        if (!v.expiresAt || v.expiresAt > now) obj[k] = v;
      }

      // Atomic write: write to .tmp then rename
      const tmp = this.file + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), "utf8");
      fs.renameSync(tmp, this.file);
      this.dirty = false;
    } catch { /* best-effort — don't crash the server */ }
  }

  // Schedule a single flush per tick regardless of how many mutations happen
  private scheduleFlush(): void {
    if (this.pending) return;
    this.pending = true;
    setImmediate(() => { this.pending = false; this.flushSync(); });
  }

  // ── Core API ─────────────────────────────────────────────────────────────────

  get<T = unknown>(key: string): T | undefined {
    const entry = this.data.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.data.delete(key);
      this.dirty = true;
      return undefined;
    }
    return entry.value as T;
  }

  set(key: string, value: unknown, ttlMs?: number): void {
    this.data.set(key, { value, expiresAt: ttlMs ? Date.now() + ttlMs : undefined });
    this.dirty = true;
    this.scheduleFlush();
  }

  delete(key: string): void {
    if (this.data.delete(key)) {
      this.dirty = true;
      this.scheduleFlush();
    }
  }

  /** Delete all keys that start with `prefix`. */
  clear(prefix?: string): void {
    if (prefix) {
      for (const k of this.data.keys()) if (k.startsWith(prefix)) this.data.delete(k);
    } else {
      this.data.clear();
    }
    this.dirty = true;
    this.scheduleFlush();
  }

  /** Returns the number of non-expired entries. */
  size(): number {
    const now = Date.now();
    let n = 0;
    for (const v of this.data.values()) {
      if (!v.expiresAt || v.expiresAt > now) n++;
    }
    return n;
  }

  /** Return all non-expired keys matching an optional prefix. */
  keys(prefix?: string): string[] {
    const now = Date.now();
    const out: string[] = [];
    for (const [k, v] of this.data.entries()) {
      if (v.expiresAt && v.expiresAt <= now) continue;
      if (!prefix || k.startsWith(prefix)) out.push(k);
    }
    return out;
  }

  // ── Namespaced sub-store ─────────────────────────────────────────────────────

  ns(prefix: string): Namespace {
    return new Namespace(this, prefix);
  }
}

export class Namespace {
  constructor(private readonly store: PersistentStore, private readonly prefix: string) {}

  private k(key: string): string { return `${this.prefix}:${key}`; }

  get<T = unknown>(key: string): T | undefined     { return this.store.get<T>(this.k(key)); }
  set(key: string, value: unknown, ttlMs?: number)  { this.store.set(this.k(key), value, ttlMs); }
  delete(key: string)                               { this.store.delete(this.k(key)); }
  clear()                                           { this.store.clear(`${this.prefix}:`); }
  keys(): string[]                                  { return this.store.keys(`${this.prefix}:`).map(k => k.slice(this.prefix.length + 1)); }
  has(key: string): boolean                         { return this.get(key) !== undefined; }
}

// ── Module-level singleton ────────────────────────────────────────────────────

let _store: PersistentStore | null = null;

export function initStore(filePath: string): PersistentStore {
  _store = new PersistentStore(filePath);
  return _store;
}

export function getStore(): PersistentStore {
  if (!_store) throw new Error("Store not initialised — call initStore() first");
  return _store;
}

// TTL constants for callers
export const TTL = {
  CURSOR:  0,             // permanent (0 = no TTL)
  ABI:     24 * 3600_000, // 24 h
  SOURCE:  24 * 3600_000, // 24 h
  LABEL:    1 * 3600_000, // 1 h
} as const;
