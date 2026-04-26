import os   from "node:os";
import path from "node:path";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

const defaultDbPath = path.join(os.homedir(), ".remix-etherscan-mcp", "store.json");

export const config = Object.freeze({
  etherscanApiKey:  requireEnv("ETHERSCAN_API_KEY"),
  defaultChainId:   Number(process.env.DEFAULT_CHAIN_ID ?? "1"),
  remixdWorkspace:  process.env.REMIXD_WORKSPACE ?? "./workspace",
  remixdReadOnly:   process.env.REMIXD_READ_ONLY === "true",
  remixIdeUrl:      process.env.REMIX_IDE_URL ?? "https://remix.ethereum.org",
  sourcifyFallback: process.env.SOURCIFY_FALLBACK !== "false",
  dbPath:           process.env.DB_PATH ?? defaultDbPath,
});

export type Config = typeof config;
