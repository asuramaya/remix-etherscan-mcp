import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { JsonRpcClient } from "../rpc/client.js";

export interface AnvilStatus {
  running:      boolean;
  port:         number | null;
  fork_url:     string | null;
  fork_block:   number | null;
  pid:          number | null;
}

export class AnvilManager {
  private proc:        ChildProcess | null = null;
  private _port:       number | null       = null;
  private _forkUrl:    string | null       = null;
  private _forkBlock:  number | null       = null;
  private _client:     JsonRpcClient | null = null;

  get running(): boolean  { return this.proc !== null && !this.proc.killed; }
  get client():  JsonRpcClient | null { return this._client; }

  get status(): AnvilStatus {
    return {
      running:    this.running,
      port:       this._port,
      fork_url:   this._forkUrl,
      fork_block: this._forkBlock,
      pid:        this.proc?.pid ?? null,
    };
  }

  async start(forkUrl: string, blockNumber?: number, port = 8545): Promise<AnvilStatus> {
    if (this.running) this.stop();

    const args = [
      "--fork-url",   forkUrl,
      "--port",       String(port),
      "--silent",
      ...(blockNumber !== undefined ? ["--fork-block-number", String(blockNumber)] : []),
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn("anvil", args, { stdio: ["ignore", "pipe", "pipe"] });
      let ready = false;

      const onData = (chunk: Buffer) => {
        const text = chunk.toString();
        if (!ready && text.includes("Listening on")) {
          ready = true;
          this.proc       = proc;
          this._port      = port;
          this._forkUrl   = forkUrl;
          this._forkBlock = blockNumber ?? null;
          this._client    = new JsonRpcClient(`http://127.0.0.1:${port}`);
          resolve(this.status);
        }
      };

      const onError = (err: Error) => {
        if (!ready) reject(new Error(`Failed to start anvil: ${err.message}. Is forge installed?`));
      };

      const onExit = (code: number | null) => {
        if (!ready) reject(new Error(`anvil exited early with code ${code ?? "unknown"}`));
        this.proc    = null;
        this._client = null;
      };

      proc.stdout?.on("data", onData);
      proc.stderr?.on("data", onData); // anvil writes ready message to stderr in some versions
      proc.on("error", onError);
      proc.on("exit",  onExit);

      // Timeout if anvil doesn't become ready within 15s
      setTimeout(() => {
        if (!ready) {
          proc.kill();
          reject(new Error("anvil did not become ready within 15 seconds"));
        }
      }, 15_000);
    });
  }

  stop(): void {
    if (this.proc && !this.proc.killed) {
      this.proc.kill("SIGTERM");
    }
    this.proc       = null;
    this._client    = null;
    this._port      = null;
    this._forkUrl   = null;
    this._forkBlock = null;
  }
}
