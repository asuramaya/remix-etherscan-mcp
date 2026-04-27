# remix-etherscan-mcp

An MCP (Model Context Protocol) server that exposes Ethereum development and audit tooling as structured tools for Claude. It wraps the Etherscan API v2, a local remixd filesystem daemon, git operations, contract compilation, and several composite audit workflows into a single server that Claude can drive directly.

## Overview

The server provides 105 tools organized into 17 categories:

- **Accounts** — balances, transaction history, token transfers, mined blocks
- **Contracts** — source code, ABI, verification, bytecode, Sourcify submission, similar-bytecode search
- **Transactions** — full objects, receipts, event logs, status
- **Blocks** — by number, by timestamp, rewards
- **Logs** — by address, by topics
- **Tokens** — ERC-20 supply, balances, holders
- **Gas** — oracle tiers, confirmation time estimation
- **Stats** — ETH price, supply, daily network metrics (PRO)
- **Proxy/EVM** — eth_call, storage slots, ENS, `multicall` (Multicall3 batch), `call_contract`, `simulate_transaction`, proxy inspection
- **Chains** — supported chain list, address labels
- **remixd Lifecycle** — start/stop/status the remixd daemon
- **Filesystem** — read/write/search/diff the workspace
- **Git** — safe git command execution, structured blame
- **Compilation** — Hardhat, Truffle, Foundry, Slither, Forge test runner, Hardhat test runner, Vyper
- **Composite** — fetch-and-open, contract diff, transaction decode, full audit setup, ETH flow tracing, event polling, historical event query
- **Analysis** — revert data decoder, storage slot reader, Gnosis Safe calldata decoder
- **ABI Registry** — built-in ABIs for ERC-20/721/1155, WETH, Uniswap V2/V3, Gnosis Safe, Ownable, AccessControl, ERC-4626

## Prerequisites

- Node.js 20 or later
- An [Etherscan API key](https://docs.etherscan.io/getting-started/viewing-api-usage-statistics) (free tier works for most tools; PRO required for some)
- For compilation and analysis tools: `npx` plus the framework tools (`hardhat`, `truffle`, `forge`) installed in the target project, and optionally `slither-analyzer` (Python) and `vyper` (for Vyper compilation)
- For remixd: `@remix-project/remixd` (resolved automatically via `npx --yes` if not found locally)

## Installation

```bash
git clone https://github.com/yourusername/remix-etherscan-mcp.git
cd remix-etherscan-mcp
npm install
npm run build
```

The compiled server lands in `dist/index.js`.

## Quick Start

```bash
export ETHERSCAN_API_KEY=your_api_key_here
node dist/index.js
```

The server starts in stdio mode, which is what Claude Desktop and Claude Code use by default.

## Configuration

All configuration is via environment variables. Only `ETHERSCAN_API_KEY` is required.

| Variable | Required | Default | Description |
|---|---|---|---|
| `ETHERSCAN_API_KEY` | Yes | — | Etherscan API key. Get one at etherscan.io. Free tier is sufficient for most tools; some are marked PRO. |
| `DEFAULT_CHAIN_ID` | No | `1` | Chain ID used when a tool call does not specify `chain_id`. `1` is Ethereum mainnet. |
| `REMIXD_WORKSPACE` | No | `./workspace` | Path to the directory shared with Remix IDE via remixd. Relative paths resolve from the working directory at startup. |
| `REMIXD_READ_ONLY` | No | `false` | Set to `true` to prevent all write operations (fs_write, fs_create_dir, fs_rename, fs_remove, fs_copy). |
| `REMIX_IDE_URL` | No | `https://remix.ethereum.org` | Remix IDE origin URL passed to remixd's `--url` flag. |
| `SOURCIFY_FALLBACK` | No | `true` | Set to `false` to disable the Sourcify fallback when Etherscan has no verified source for a contract. |
| `DB_PATH` | No | `~/.remix-etherscan-mcp/store.json` | Path for the persistent key-value store used for caching and event poller cursors. |
| `MCP_PORT` | No | `3000` | HTTP port when `--http` flag is passed. |

See [docs/configuration.md](docs/configuration.md) for full details and examples.

## Transport Modes

### stdio (default)

The server reads JSON-RPC from stdin and writes to stdout. This is the standard transport for Claude Desktop and Claude Code.

```bash
node dist/index.js
```

### HTTP (StreamableHTTP)

Pass `--http` to listen on an HTTP port instead:

```bash
MCP_PORT=3001 node dist/index.js --http
```

The server logs `[remix-etherscan-mcp] HTTP/MCP listening on http://localhost:3001/` to stderr when ready. All MCP protocol messages go over HTTP POST to the root path.

## MCP Integration

### Claude Desktop

Add the server to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "remix-etherscan-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/remix-etherscan-mcp/dist/index.js"],
      "env": {
        "ETHERSCAN_API_KEY": "your_api_key_here",
        "DEFAULT_CHAIN_ID": "1",
        "REMIXD_WORKSPACE": "/path/to/your/workspace"
      }
    }
  }
}
```

### Claude Code

Add the server via the Claude Code CLI:

```bash
claude mcp add remix-etherscan-mcp \
  -e ETHERSCAN_API_KEY=your_api_key_here \
  -e DEFAULT_CHAIN_ID=1 \
  -- node /absolute/path/to/remix-etherscan-mcp/dist/index.js
```

Or using HTTP transport (if the server is already running):

```bash
claude mcp add remix-etherscan-mcp --transport http --url http://localhost:3000
```

### HTTP Mode Configuration

```json
{
  "mcpServers": {
    "remix-etherscan-mcp": {
      "type": "http",
      "url": "http://localhost:3000"
    }
  }
}
```

## Tool Categories

### A — Accounts (8 tools)

| Tool | Description |
|---|---|
| `get_balance` | ETH balance for 1–20 addresses simultaneously |
| `get_balance_history` | Historical balance at a specific block number (PRO) |
| `get_transactions` | Normal (external) transactions for an address; block range validated |
| `get_internal_transactions` | Internal transactions by address, tx hash, or block range |
| `get_erc20_transfers` | ERC-20 token transfer events; optional token contract filter |
| `get_erc721_transfers` | ERC-721 (NFT) transfer events; optional token contract filter |
| `get_erc1155_transfers` | ERC-1155 multi-token transfer events |
| `get_mined_blocks` | Blocks validated by an address; includes uncle blocks |

### B — Contracts (11 tools)

| Tool | Description |
|---|---|
| `get_contract_source` | Full verified source, ABI, compiler settings; Sourcify fallback |
| `get_contract_abi` | ABI only, as a parsed JSON array |
| `get_contract_creation` | Creator address and creation tx hash for up to 5 contracts |
| `verify_source` | Submit Solidity source for Etherscan verification; returns GUID |
| `verify_vyper` | Submit Vyper source for Etherscan verification; returns GUID |
| `check_verify_status` | Poll a verification GUID for pass/fail/pending |
| `verify_proxy` | Verify a proxy's link to its implementation |
| `check_proxy_verification` | Poll proxy verification status |
| `get_bytecode` | Raw deployed bytecode for any address |

### C — Transactions (4 tools)

| Tool | Description |
|---|---|
| `get_transaction` | Full transaction object by hash |
| `get_transaction_receipt` | Receipt: status, logs, gas used, deployed contract address |
| `get_tx_logs` | All event logs from a transaction; optional ABI decoding |
| `get_transaction_status` | Lightweight success/fail check |

### D — Blocks (3 tools)

| Tool | Description |
|---|---|
| `get_block_by_number` | Full block object by number or tag (latest/earliest/pending) |
| `get_block_by_timestamp` | Closest block to a Unix timestamp |
| `get_block_rewards` | Miner reward and uncle rewards for a block |

### E — Logs (2 tools)

| Tool | Description |
|---|---|
| `get_logs_by_address` | Event logs emitted by a contract; block range validated |
| `get_logs_by_topics` | Logs filtered by up to 4 topics with and/or operators |

### F — Tokens (6 tools)

| Tool | Description |
|---|---|
| `get_token_info` | Rich token metadata: name, symbol, supply, socials (PRO) |
| `get_token_supply` | ERC-20 total supply in raw units and formatted |
| `get_token_balance` | ERC-20 balance for a wallet at an optional block |
| `get_token_balance_history` | ERC-20 balance at a specific block (PRO) |
| `get_token_holder_count` | Unique holder count |
| `get_token_holders` | Paginated holder list with balances (PRO) |

### G — Gas (2 tools)

| Tool | Description |
|---|---|
| `get_gas_oracle` | Current safe/proposed/fast gas tiers plus EIP-1559 base fee |
| `estimate_confirmation_time` | Estimated seconds to confirm at a given gas price in wei |

### H — Stats (15 tools)

| Tool | Description |
|---|---|
| `get_eth_price` | Current ETH price in USD and BTC |
| `get_eth_price_history` | Daily ETH price over a date range (PRO) |
| `get_eth_supply` | Circulating ETH supply |
| `get_eth_supply_v2` | Supply breakdown: circulating, staked, burned, withdrawals |
| `get_daily_tx_count` | Daily transaction count over a date range (PRO) |
| `get_daily_gas_used` | Daily total gas consumed (PRO) |
| `get_daily_avg_gas_price` | Daily min/avg/max gas price (PRO) |
| `get_daily_block_count` | Daily block count and total rewards (PRO) |
| `get_daily_block_size` | Daily average block size in bytes (PRO) |
| `get_daily_block_time` | Daily average block time in seconds (PRO) |
| `get_daily_block_rewards` | Daily block rewards in ETH (PRO) |
| `get_daily_tx_fees` | Daily total transaction fees (PRO) |
| `get_node_count` | Total discoverable Ethereum nodes |
| `get_chain_size` | Blockchain size by client type and sync mode (PRO) |

### I — Proxy/EVM (15 tools)

| Tool | Description |
|---|---|
| `eth_block_number` | Latest block number |
| `eth_call` | Read-only call with ABI encoding; supports `from` for msg.sender simulation |
| `eth_get_storage_at` | Raw storage slot value at a position |
| `eth_get_code` | Contract bytecode at an address |
| `eth_get_transaction_count` | Address nonce |
| `eth_gas_price` | Current gas price in wei and gwei |
| `eth_estimate_gas` | Gas estimate for a transaction |
| `eth_send_raw_transaction` | Broadcast a pre-signed raw transaction |
| `contract_read_multi` | Up to 50 eth_calls in one tool call with automatic rate limiting |
| `ens_resolve` | ENS name to address via mainnet registry and resolver |
| `read_proxy_slots` | EIP-1967 and OpenZeppelin proxy storage slots |
| `eth_get_uncle` | Uncle block by block number and index |
| `multicall` | Batch up to 100 contract reads via Multicall3 in a single RPC round-trip |
| `call_contract` | Call any view/pure function by signature — encodes args, calls eth_call, decodes result |
| `simulate_transaction` | Simulate a state-changing call with a sender and ETH value; decodes reverts automatically |

### J — Chains (2 tools)

| Tool | Description |
|---|---|
| `get_supported_chains` | All Etherscan v2 supported chains with live status |
| `get_address_label` | Nametag and labels for an address (PRO Plus) |

### K — remixd Lifecycle (3 tools)

| Tool | Description |
|---|---|
| `remixd_start` | Start the remixd daemon; shares workspace with Remix IDE on ports 65520–65525 |
| `remixd_stop` | Stop the running remixd daemon |
| `remixd_status` | Current status, shared folder, ports, detected frameworks |

### L — Filesystem (13 tools)

| Tool | Description |
|---|---|
| `fs_list` | Directory tree of the workspace |
| `fs_read` | File content with size warning at 500 KB; optional byte limit |
| `fs_write` | Write file; creates parent directories; blocked in read-only mode |
| `fs_exists` | Path existence check |
| `fs_is_file` | True if path is a regular file |
| `fs_is_directory` | True if path is a directory |
| `fs_create_dir` | Create directory recursively; blocked in read-only mode |
| `fs_rename` | Rename or move file or directory; blocked in read-only mode |
| `fs_remove` | Delete recursively; requires `confirm: true`; blocked in read-only mode |
| `fs_search` | Search files by string or regex with file glob filter |
| `fs_stat` | Type, size in bytes, last-modified timestamp |
| `fs_copy` | Copy file or directory recursively; blocked in read-only mode |

### M — Git (2 tools)

| Tool | Description |
|---|---|
| `git_exec` | Run git commands in the workspace; shell operators and dangerous flags blocked |
| `git_blame` | Structured line-by-line blame: author, commit, timestamp, line content |

### N — Compilation (7 tools)

| Tool | Description |
|---|---|
| `compile_hardhat` | `npx hardhat compile`; returns parsed diagnostics and artifact ABIs |
| `compile_truffle` | `npx truffle compile`; reads Truffle-format artifacts |
| `compile_foundry` | `forge build`; returns gas estimates alongside artifacts |
| `compile_slither` | Slither static analysis; structured findings by severity |
| `run_forge_test` | `forge test --json`; per-test pass/fail and gas; supports `--match-test` / `--match-contract` |
| `run_hardhat_test` | `npx hardhat test`; parses Mocha pass/fail/pending counts |
| `compile_vyper` | Vyper CLI compilation; returns ABI, bytecode, and structured diagnostics |

### O — Composite (7 tools)

| Tool | Description |
|---|---|
| `fetch_and_open` | Fetch verified source, write to workspace, optionally start remixd |
| `diff_contracts` | Unified diff between two verified contracts across chains; detects renames |
| `decode_transaction` | Decode calldata and events from a tx hash; auto-fetches ABI |
| `audit_setup` | Full bootstrap: fetch + write + remixd + Slither; degrades gracefully |
| `trace_eth_flow` | Internal ETH flow with optional address labels; labels cached 1 hour |
| `watch_events` | Stateful event poller; cursor persists across server restarts; `max_blocks` caps per-poll scan |
| `get_events` | Paginated historical event fetch over an explicit block range with ABI decoding |

### P — Analysis (3 tools)

| Tool | Description |
|---|---|
| `decode_error` | Decode revert data: `Error(string)`, `Panic(uint256)`, custom errors from ABI |
| `decode_storage` | Read and decode storage variables via solc/forge storage layout JSON |
| `safe_decode` | Decode Gnosis Safe `execTransaction` calldata; optionally decodes inner `data` against an ABI |

### R — ABI Registry (2 tools)

| Tool | Description |
|---|---|
| `abi_list` | List all built-in well-known ABIs by key, name, and description |
| `abi_get` | Retrieve the full ABI for a built-in contract by key (e.g. `erc20`, `uniswap-v2-pair`) |

## Architecture

```
src/
  index.ts                  Entry point: init store, build dependencies, register tools, start transport
  config.ts                 Reads env vars; throws on missing ETHERSCAN_API_KEY
  errors.ts                 Error codes, McpErrorEnvelope type, withRetry (exponential backoff)
  db/
    store.ts                Zero-dependency persistent KV store; atomic writes; TTL per entry
  state/
    cursors.ts              watch_events cursor state backed by the persistent store
  etherscan/
    chains.ts               Chain ID map and ETHERSCAN_V2_BASE URL constant
    client.ts               Etherscan API v2 client: GET and POST with retry + error normalization
    sourcify.ts             Sourcify fallback: full_match → partial_match → any
  abi/
    codec.ts                ethers v6 ABI encode/decode for eth_call and log decoding
  remixd/
    manager.ts              Spawn/stop remixd daemon; detect frameworks; manage WS client
    ws-client.ts            WebSocket client implementing the remixd handshake protocol
    fs.ts                   FSClient: path traversal protection; WS-first with direct-fs fallback
  tools/
    schemas.ts              Shared Zod primitives: address, txHash, chainId, blockRange, pagination
    registry.ts             registerAllTools(): calls each category's register function
    accounts.ts             A1–A8
    contracts.ts            B1–B11
    transactions.ts         C1–C4
    blocks.ts               D1–D3
    logs.ts                 E1–E2
    tokens.ts               F1–F6
    gas.ts                  G1–G2
    stats.ts                H1–H15
    proxy.ts                I1–I12, I13 call_contract, I14 simulate_transaction
    chains.ts               J1–J2
    remixd-lifecycle.ts     K1–K3
    filesystem.ts           L1–L13
    git.ts                  M1–M2
    compilation.ts          N1–N7
    composite.ts            O1–O7
    analysis.ts             P1–P3, R1–R2
  abi/
    registry.ts             9 built-in ABI definitions (ERC-20/721/1155, WETH, Uniswap V2/V3, Safe, Ownable, ERC-4626)
```

See [docs/architecture.md](docs/architecture.md) for the startup sequence, request flow, caching strategy, and remixd WebSocket integration details.

## Security

### Path Traversal Protection

All filesystem paths are resolved against the workspace root using `path.resolve()`. If the resolved absolute path does not start with `root + path.sep`, the operation is rejected with a `PATH_TRAVERSAL` error. This prevents directory climbing via `../` sequences or absolute paths.

### Read-Only Mode

Setting `REMIXD_READ_ONLY=true` (or passing `read_only: true` to `remixd_start`) activates read-only mode across all filesystem operations. Any tool that would write, move, delete, or copy a file returns a `READ_ONLY_MODE` error without touching the disk. This is the recommended mode for pure audit workflows where source code should not be modified.

### Git Command Injection Prevention

`git_exec` uses `execFile` (not `execSync` or `exec`), which passes arguments as an array directly to the OS without invoking a shell. Before execution, the input is validated against a regular expression that rejects shell operators (`;`, `&&`, `|`, `>`, `` ` ``, `$`, `()`, `{}`, `[]`) and newlines. A secondary check blocks dangerous flags (`--upload-pack`, `--receive-pack`, `--exec`, `--local-port`, `--proxy-command`) that could execute arbitrary binaries.

### Rate Limiting

The Etherscan client retries on HTTP 429 and on result messages containing "rate limit" or "Max rate", using exponential backoff with a base delay of 500ms and up to 3 attempts. Tools that make multiple sequential calls (such as `contract_read_multi` and `read_proxy_slots`) insert a 350ms gap between calls to stay within the free-tier 3 requests/second limit.

### Persistent Store

The store file at `~/.remix-etherscan-mcp/store.json` is written atomically (write to `.tmp` then `rename`). The directory is created with `recursive: true` if it does not exist. The file stores cached source code (24h TTL), cached address labels (1h TTL), and event poller cursors (permanent). No secrets or API keys are ever written to the store.

## Development

```bash
# Build TypeScript
npm run build

# Watch mode (requires already-built dist)
npm run dev

# Type check without emitting
npx tsc --noEmit
```

TypeScript targets ES2022 with `NodeNext` module resolution. All source files use `.js` extensions in imports for ESM compatibility.

## Supported Chains

The server uses the Etherscan v2 API, which accepts a `chainid` query parameter and routes to the appropriate explorer. The full list of supported chains can be retrieved at runtime with `get_supported_chains`. Common chains include:

| Chain ID | Network |
|---|---|
| 1 | Ethereum Mainnet |
| 11155111 | Sepolia Testnet |
| 17000 | Holesky Testnet |
| 56 | BNB Smart Chain |
| 137 | Polygon |
| 42161 | Arbitrum One |
| 10 | Optimism |
| 8453 | Base |
| 43114 | Avalanche C-Chain |
| 324 | zkSync Era |
| 59144 | Linea |
| 534352 | Scroll |

## License

See LICENSE file.
