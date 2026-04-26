import { spawn, execSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import type { Config } from "../config.js";
import { RemixdWSClient } from "./ws-client.js";

interface RemixdStatus {
  running:             boolean;
  pid?:                number;
  folder?:             string;
  readOnly?:           boolean;
  connectedClients:    number;
  detectedFrameworks:  string[];
  websocket_connected: boolean;
  services: {
    filesystem: { port: number; url: string };
    git:        { port: number; url: string };
    hardhat:    { port: number; url: string; detected: boolean };
    slither:    { port: number; url: string };
    truffle:    { port: number; url: string; detected: boolean };
    foundry:    { port: number; url: string; detected: boolean };
  };
}

function detectFrameworks(folder: string): string[] {
  const found: string[] = [];
  if (existsSync(`${folder}/hardhat.config.js`) || existsSync(`${folder}/hardhat.config.ts`)) found.push("hardhat");
  if (existsSync(`${folder}/truffle-config.js`)) found.push("truffle");
  if (existsSync(`${folder}/foundry.toml`))       found.push("foundry");
  return found;
}

function resolveRemixdBin(): string[] {
  const cached = "/home/asuramaya/.npm/_npx/cd7d3ad854976e28/node_modules/.bin/remixd";
  if (existsSync(cached)) return [cached];
  try {
    const bin = execSync("which remixd", { encoding: "utf8" }).trim();
    if (bin) return [bin];
  } catch { /* not in PATH */ }
  return ["npx", "--yes", "@remix-project/remixd"];
}

export class RemixdManager {
  private proc:     ChildProcess | null     = null;
  private folder:   string | null           = null;
  private readOnly  = false;
  private wsClient: RemixdWSClient | null   = null;
  private wsRetries = 0;
  private readonly config: Config;
  private readonly bin:    string[];

  constructor(config: Config) {
    this.config = config;
    this.bin    = resolveRemixdBin();
  }

  start(folder?: string, readOnly?: boolean, remixIdeUrl?: string): RemixdStatus {
    if (this.proc && !this.proc.killed) {
      throw new Error("remixd is already running. Call remixd_stop first.");
    }

    this.folder   = folder   ?? this.config.remixdWorkspace;
    this.readOnly = readOnly ?? this.config.remixdReadOnly;
    const ideUrl  = remixIdeUrl ?? this.config.remixIdeUrl;

    const args = [
      ...(this.bin.length > 1 ? this.bin.slice(1) : []),
      "-s", this.folder,
      "-u", ideUrl,
      ...(this.readOnly ? ["-r"] : []),
    ];

    const [cmd, ...rest] = [this.bin[0]!, ...args];
    this.proc = spawn(cmd, rest, { stdio: "pipe", detached: false });

    this.proc.on("error", (err) => {
      process.stderr.write(`[remixd] error: ${err.message}\n`);
    });

    // Give remixd 2 s to open its ports then connect the WS client
    this.wsRetries = 0;
    setTimeout(() => this.tryConnectWS(ideUrl), 2000);

    return this.buildStatus();
  }

  private tryConnectWS(origin: string): void {
    if (!this.isRunning) return;
    const client = new RemixdWSClient();
    client.connect(65520, origin, 4000)
      .then(() => {
        this.wsClient = client;
        process.stderr.write("[remixd] WS filesystem client connected on :65520\n");
      })
      .catch((err) => {
        if (this.wsRetries < 5 && this.isRunning) {
          this.wsRetries++;
          setTimeout(() => this.tryConnectWS(origin), 1500);
        } else {
          process.stderr.write(`[remixd] WS connect failed after retries: ${err.message}\n`);
        }
      });
  }

  stop(): { stopped: boolean; pid: number | undefined } {
    const pid = this.proc?.pid;
    if (this.proc && !this.proc.killed) this.proc.kill("SIGTERM");
    this.proc = null;
    this.wsClient?.disconnect();
    this.wsClient = null;
    return { stopped: true, pid };
  }

  status(): RemixdStatus { return this.buildStatus(); }

  get sharedFolder(): string { return this.folder ?? this.config.remixdWorkspace; }
  get isRunning():    boolean { return this.proc !== null && !this.proc.killed; }

  /** WS client connected to the remixd filesystem service (port 65520). */
  get filesystemWS(): RemixdWSClient | null {
    return this.wsClient?.isConnected ? this.wsClient : null;
  }

  private buildStatus(): RemixdStatus {
    const folder     = this.folder ?? this.config.remixdWorkspace;
    const frameworks = detectFrameworks(folder);
    return {
      running:             this.isRunning,
      pid:                 this.proc?.pid,
      folder,
      readOnly:            this.readOnly,
      connectedClients:    0,
      detectedFrameworks:  frameworks,
      websocket_connected: this.wsClient?.isConnected ?? false,
      services: {
        filesystem: { port: 65520, url: "ws://127.0.0.1:65520" },
        git:        { port: 65521, url: "ws://127.0.0.1:65521" },
        hardhat:    { port: 65522, url: "ws://127.0.0.1:65522", detected: frameworks.includes("hardhat") },
        slither:    { port: 65523, url: "ws://127.0.0.1:65523" },
        truffle:    { port: 65524, url: "ws://127.0.0.1:65524", detected: frameworks.includes("truffle") },
        foundry:    { port: 65525, url: "ws://127.0.0.1:65525", detected: frameworks.includes("foundry") },
      },
    };
  }
}
