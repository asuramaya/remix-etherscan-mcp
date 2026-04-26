import WebSocket from "ws";

type Msg = {
  action:   string;
  key:      string;
  name?:    string;
  id?:      number;
  payload?: unknown;
  error?:   string;
};

type Callback = { resolve: (v: unknown) => void; reject: (e: Error) => void };

export class RemixdWSClient {
  private ws:      WebSocket | null = null;
  private pending  = new Map<number, Callback>();
  private nextId   = 1;
  private loaded   = false;

  async connect(port: number, origin: string, timeoutMs = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ws?.terminate();
        reject(new Error(`remixd WS connect timeout on :${port}`));
      }, timeoutMs);

      this.ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { origin } });

      this.ws.on("message", (raw: Buffer) => {
        let msg: Msg;
        try { msg = JSON.parse(raw.toString()) as Msg; } catch { return; }

        // Step 1 — remixd initiates handshake
        if (msg.key === "handshake" && (msg.action === "request" || msg.action === "call")) {
          this.send({ action: "request", key: "handshake", id: -1, payload: ["mcp-remixd-client"] });
          return;
        }

        // Step 2 — remixd confirms our handshake with its method list
        if (msg.key === "handshake" && msg.action === "response") {
          if (!this.loaded) {
            this.loaded = true;
            clearTimeout(timer);
            resolve();
          }
          return;
        }

        // Regular method response
        if (msg.action === "response" && msg.id !== undefined) {
          const cb = this.pending.get(msg.id);
          if (cb) {
            this.pending.delete(msg.id);
            msg.error ? cb.reject(new Error(msg.error)) : cb.resolve(msg.payload);
          }
        }
      });

      this.ws.on("error", (err) => { clearTimeout(timer); reject(err); });

      this.ws.on("close", () => {
        this.loaded = false;
        for (const cb of this.pending.values()) cb.reject(new Error("remixd WS closed"));
        this.pending.clear();
      });
    });
  }

  private send(msg: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  async call<T = unknown>(method: string, ...args: unknown[]): Promise<T> {
    if (!this.loaded || this.ws?.readyState !== WebSocket.OPEN) {
      throw new Error("remixd WS not connected");
    }
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (v) => resolve(v as T), reject });
      this.send({ action: "request", key: method, name: "mcp-remixd-client", id, payload: args });
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`remixd WS call timed out: ${method}`));
      }, 30_000);
    });
  }

  get isConnected(): boolean {
    return this.loaded && this.ws?.readyState === WebSocket.OPEN;
  }

  disconnect(): void {
    this.ws?.close();
    this.ws    = null;
    this.loaded = false;
    for (const cb of this.pending.values()) cb.reject(new Error("disconnected"));
    this.pending.clear();
  }
}
