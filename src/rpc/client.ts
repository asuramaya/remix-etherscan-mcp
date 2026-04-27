export class JsonRpcClient {
  private url: string;
  private _id = 1;

  constructor(url: string) {
    this.url = url;
  }

  async call<T>(method: string, params: unknown[] = []): Promise<T> {
    const res = await fetch(this.url, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ jsonrpc: "2.0", id: this._id++, method, params }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} from RPC endpoint`);

    const json = await res.json() as { result?: T; error?: { code: number; message: string } };
    if (json.error) {
      throw Object.assign(
        new Error(`RPC ${method}: ${json.error.message}`),
        { rpcCode: json.error.code },
      );
    }
    return json.result as T;
  }
}
