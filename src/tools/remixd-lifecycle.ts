import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { RemixdManager } from "../remixd/manager.js";
import { mcpError } from "../errors.js";

export function registerRemixdLifecycle(server: McpServer, remixd: RemixdManager): void {

  // K1 — remixd_start
  server.registerTool("remixd_start", {
    description: "Start the remixd daemon. Shares a local folder with Remix IDE over WebSocket on ports 65520–65525.",
    inputSchema: z.object({
      folder:       z.string().optional(),
      read_only:    z.boolean().optional(),
      remix_ide_url: z.string().url().optional(),
    }),
  }, async (args) => {
    try {
      const status = remixd.start(args.folder, args.read_only, args.remix_ide_url);
      return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("REMIXD_NOT_RUNNING", err)) }], isError: true };
    }
  });

  // K2 — remixd_stop
  server.registerTool("remixd_stop", {
    description: "Gracefully stop the running remixd daemon.",
    inputSchema: z.object({}),
  }, async () => {
    try {
      const result = remixd.stop();
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("REMIXD_NOT_RUNNING", err)) }], isError: true };
    }
  });

  // K3 — remixd_status
  server.registerTool("remixd_status", {
    description: "Current remixd daemon status: running state, shared folder, ports, detected frameworks.",
    inputSchema: z.object({}),
  }, async () => {
    try {
      const status = remixd.status();
      return { content: [{ type: "text" as const, text: JSON.stringify(status, null, 2) }] };
    } catch (err) {
      return { content: [{ type: "text" as const, text: JSON.stringify(mcpError("REMIXD_NOT_RUNNING", err)) }], isError: true };
    }
  });
}
