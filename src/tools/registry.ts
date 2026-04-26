import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EtherscanClient } from "../etherscan/client.js";
import type { RemixdManager } from "../remixd/manager.js";
import type { FSClient } from "../remixd/fs.js";
import type { Config } from "../config.js";

import { registerAccounts }        from "./accounts.js";
import { registerContracts }       from "./contracts.js";
import { registerTransactions }    from "./transactions.js";
import { registerBlocks }          from "./blocks.js";
import { registerLogs }            from "./logs.js";
import { registerTokens }          from "./tokens.js";
import { registerGas }             from "./gas.js";
import { registerStats }           from "./stats.js";
import { registerProxy }           from "./proxy.js";
import { registerChains }          from "./chains.js";
import { registerRemixdLifecycle } from "./remixd-lifecycle.js";
import { registerFilesystem }      from "./filesystem.js";
import { registerGit }             from "./git.js";
import { registerCompilation }     from "./compilation.js";
import { registerComposite }       from "./composite.js";
import { registerAnalysis }        from "./analysis.js";

export function registerAllTools(
  server:  McpServer,
  es:      EtherscanClient,
  remixd:  RemixdManager,
  fsc:     FSClient,
  config:  Config,
): void {
  registerAccounts(server, es);
  registerContracts(server, es, config);
  registerTransactions(server, es);
  registerBlocks(server, es);
  registerLogs(server, es);
  registerTokens(server, es);
  registerGas(server, es);
  registerStats(server, es);
  registerProxy(server, es);
  registerChains(server, es);
  registerRemixdLifecycle(server, remixd);
  registerFilesystem(server, fsc);
  registerGit(server, remixd);
  registerCompilation(server, remixd);
  registerComposite(server, es, remixd, fsc);
  registerAnalysis(server, es);
}
