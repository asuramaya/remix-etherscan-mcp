# Configuration Reference

All configuration is read from environment variables at startup. There are no configuration files. The server is statically configured: changing an environment variable requires a restart.

## Required Variables

### `ETHERSCAN_API_KEY`

The Etherscan API key used for all Etherscan v2 API calls. This variable is mandatory; the server throws `Missing required environment variable: ETHERSCAN_API_KEY` and exits if it is absent.

**Where to get one:** Register at [etherscan.io](https://etherscan.io) and create a key under your account's API section.

**API tiers:**

- **Free** — 5 calls/second, 100,000 calls/day. Sufficient for most tools.
- **PRO** — Higher rate limits and access to PRO-only endpoints: `get_balance_history`, `get_eth_price_history`, `get_token_info`, `get_token_balance_history`, `get_token_holders`, all `get_daily_*` stats, `get_chain_size`.
- **PRO Plus** — Required for `get_address_label`.

```bash
export ETHERSCAN_API_KEY=ABCDE12345ABCDE12345ABCDE12345AB
```

## Optional Variables

### `DEFAULT_CHAIN_ID`

**Default:** `1` (Ethereum Mainnet)

The chain ID used when a tool call does not include a `chain_id` parameter. All Etherscan v2 tools accept an optional `chain_id` per call; this variable sets the fallback.

```bash
export DEFAULT_CHAIN_ID=137      # Default to Polygon
export DEFAULT_CHAIN_ID=42161    # Default to Arbitrum One
export DEFAULT_CHAIN_ID=11155111 # Default to Sepolia
```

Common chain IDs:

| ID | Network |
|---|---|
| 1 | Ethereum Mainnet |
| 11155111 | Sepolia |
| 17000 | Holesky |
| 56 | BNB Smart Chain |
| 137 | Polygon |
| 42161 | Arbitrum One |
| 10 | Optimism |
| 8453 | Base |
| 43114 | Avalanche C-Chain |
| 324 | zkSync Era |
| 59144 | Linea |
| 534352 | Scroll |

Use `get_supported_chains` (no parameters required) to retrieve the full list at runtime.

### `REMIXD_WORKSPACE`

**Default:** `./workspace`

The local directory that `remixd_start` shares with Remix IDE. Relative paths resolve from the working directory of the Node process at startup. This path is also the root for all filesystem tools (`fs_read`, `fs_write`, `fs_list`, etc.) and git tools.

The directory does not need to exist at startup; remixd will create it, and `fs_write` and `fs_create_dir` create parent directories automatically.

```bash
export REMIXD_WORKSPACE=/home/user/audit-workspace
export REMIXD_WORKSPACE=/projects/defi-audit/contracts
export REMIXD_WORKSPACE=./workspace   # relative, resolved from cwd
```

When `remixd_start` is called with a `folder` argument, that folder overrides `REMIXD_WORKSPACE` for the lifecycle of that daemon instance. The FSClient's root also updates to match.

### `REMIXD_READ_ONLY`

**Default:** `false`

Set to the literal string `true` to enable read-only mode. When active, any tool that would write to the filesystem — `fs_write`, `fs_create_dir`, `fs_rename`, `fs_remove`, `fs_copy` — returns a `READ_ONLY_MODE` error without touching disk.

This also sets the `-r` flag on the remixd daemon, which prevents Remix IDE from writing back to the local filesystem through the WebSocket connection.

```bash
export REMIXD_READ_ONLY=true   # enable
export REMIXD_READ_ONLY=false  # disable (default)
# unset = false
```

**Recommendation:** Use `REMIXD_READ_ONLY=true` for pure audit workflows where you are reading and analysing source code but do not need to modify it.

### `REMIX_IDE_URL`

**Default:** `https://remix.ethereum.org`

The Remix IDE origin URL passed to remixd via its `--url` flag. remixd uses this for CORS checking on its WebSocket server — only connections from this origin are accepted.

Change this if you are running a local or self-hosted Remix IDE instance.

```bash
export REMIX_IDE_URL=https://remix.ethereum.org   # default (hosted)
export REMIX_IDE_URL=http://localhost:8080         # local Remix IDE
```

### `SOURCIFY_FALLBACK`

**Default:** `true` (enabled)

When enabled, `get_contract_source` and the composite tools (`fetch_and_open`, `audit_setup`, `diff_contracts`) will query [Sourcify](https://sourcify.dev) if Etherscan returns no verified source for a contract address.

The fallback tries three Sourcify endpoints in order:
1. Full match: `GET /files/full_match/{chainId}/{address}/`
2. Partial match: `GET /files/partial_match/{chainId}/{address}/`
3. Any match: `GET /files/any/{chainId}/{address}`

Set to `false` to disable the fallback entirely.

```bash
export SOURCIFY_FALLBACK=true   # default
export SOURCIFY_FALLBACK=false  # Etherscan only
```

### `DB_PATH`

**Default:** `~/.remix-etherscan-mcp/store.json`

Path to the JSON file used by the persistent key-value store. The directory is created recursively if it does not exist. Writes are atomic (write to `.tmp`, then `rename`).

The store holds:
- `source:` namespace — cached verified source code with a 24-hour TTL
- `label:` namespace — cached address nametags with a 1-hour TTL
- `cursor:` namespace — `watch_events` block cursors (permanent, no TTL)

```bash
export DB_PATH=/tmp/mcp-store.json           # ephemeral session store
export DB_PATH=/data/remix-mcp/store.json    # custom persistent location
# unset = ~/.remix-etherscan-mcp/store.json
```

To fully reset all cached state, delete the file. The server recreates it on the next write.

### `MCP_PORT`

**Default:** `3000`

Only used when the server is started with the `--http` flag. Sets the TCP port for the StreamableHTTP MCP transport.

```bash
MCP_PORT=3001 node dist/index.js --http
MCP_PORT=8080 node dist/index.js --http
```

This variable has no effect in stdio mode (the default when `--http` is not passed).

## Full Example

```bash
# Minimal — required only
export ETHERSCAN_API_KEY=ABCDE12345ABCDE12345ABCDE12345AB
node dist/index.js

# Full configuration
export ETHERSCAN_API_KEY=ABCDE12345ABCDE12345ABCDE12345AB
export DEFAULT_CHAIN_ID=1
export REMIXD_WORKSPACE=/home/user/audit-workspace
export REMIXD_READ_ONLY=true
export REMIX_IDE_URL=https://remix.ethereum.org
export SOURCIFY_FALLBACK=true
export DB_PATH=/home/user/.remix-etherscan-mcp/store.json
node dist/index.js

# HTTP mode on a custom port
export ETHERSCAN_API_KEY=ABCDE12345ABCDE12345ABCDE12345AB
MCP_PORT=3001 node dist/index.js --http
```

## Claude Desktop Configuration Example

```json
{
  "mcpServers": {
    "remix-etherscan-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/remix-etherscan-mcp/dist/index.js"],
      "env": {
        "ETHERSCAN_API_KEY": "ABCDE12345ABCDE12345ABCDE12345AB",
        "DEFAULT_CHAIN_ID": "1",
        "REMIXD_WORKSPACE": "/home/user/audit-workspace",
        "REMIXD_READ_ONLY": "true",
        "SOURCIFY_FALLBACK": "true"
      }
    }
  }
}
```
