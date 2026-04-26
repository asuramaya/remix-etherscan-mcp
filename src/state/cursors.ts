// Persistent cursor store for watch_events.
// Backed by the module-level PersistentStore (initStore must be called at startup).
import { getStore } from "../db/store.js";

function key(address: string, chainId: number, topic0?: string): string {
  return `${address.toLowerCase()}:${chainId}:${topic0 ?? ""}`;
}

export function getCursor(address: string, chainId: number, topic0?: string): number | undefined {
  return getStore().ns("cursor").get<number>(key(address, chainId, topic0));
}

export function setCursor(address: string, chainId: number, block: number, topic0?: string): void {
  getStore().ns("cursor").set(key(address, chainId, topic0), block);
}

export function resetCursor(address: string, chainId: number, topic0?: string): void {
  getStore().ns("cursor").delete(key(address, chainId, topic0));
}
