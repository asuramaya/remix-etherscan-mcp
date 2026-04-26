import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "./config.js";
import { EtherscanClient } from "./etherscan/client.js";
import { RemixdManager } from "./remixd/manager.js";
import { FSClient } from "./remixd/fs.js";
import { registerAllTools } from "./tools/registry.js";
import { initStore, getStore } from "./db/store.js";

const server = new McpServer({
  name:    "remix-etherscan-mcp",
  version: "1.0.0",
});

initStore(config.dbPath);

const es     = new EtherscanClient(config);
const remixd = new RemixdManager(config);
const fsc    = new FSClient(config.remixdWorkspace, config.remixdReadOnly, remixd);

registerAllTools(server, es, remixd, fsc, config);

const useHttp = process.argv.includes("--http");
const port    = Number(process.env.MCP_PORT ?? 3000);

function gracefulShutdown(transport?: { close?: () => Promise<void> }) {
  return async () => {
    remixd.stop();
    if (transport?.close) await transport.close();
    await server.close();
    getStore().flushSync();
    process.exit(0);
  };
}

if (useHttp) {
  const { createServer } = await import("node:http");
  const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req as AsyncIterable<Buffer>) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) as unknown : undefined;
    await transport.handleRequest(req, res, body);
  });

  httpServer.listen(port, () => {
    process.stderr.write(`[remix-etherscan-mcp] HTTP/MCP listening on http://localhost:${port}/\n`);
  });

  const shutdown = gracefulShutdown(transport);
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
} else {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = gracefulShutdown();
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
