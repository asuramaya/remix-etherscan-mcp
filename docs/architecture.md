# Architecture

## Startup Sequence

When the server starts (`node dist/index.js`), the following steps happen synchronously in order:

1. **Config validation** (`src/config.ts`)
   - `requireEnv("ETHERSCAN_API_KEY")` reads the environment and throws immediately if the key is missing.
   - All other env vars are read with defaults and frozen into the `config` object.

2. **Store initialization** (`src/db/store.ts`)
   - `initStore(config.dbPath)` constructs a `PersistentStore` instance.
   - The store reads the existing JSON file if it exists, filtering out expired entries (those where `expiresAt <= Date.now()`).
   - A `process.on("exit", ...)` handler is registered to flush dirty state synchronously before the process exits.
   - The store singleton is accessible everywhere via `getStore()`.

3. **Dependency construction** (`src/index.ts`)
   - `EtherscanClient` is instantiated with the API key and default chain ID.
   - `RemixdManager` is instantiated; it resolves the remixd binary path (cached npx path, then `which remixd`, then `npx --yes @remix-project/remixd`). The daemon is not started yet.
   - `FSClient` is instantiated with the workspace path and read-only flag. The workspace directory is not validated at this point.

4. **MCP server construction**
   - `McpServer` is instantiated with name `"remix-etherscan-mcp"` and version `"1.0.0"`.

5. **Tool registration** (`src/tools/registry.ts`)
   - `registerAllTools()` calls each category's `register*()` function in sequence.
   - Each function calls `server.registerTool()` for every tool in its category. Registration is synchronous — it only stores the Zod schema and handler callback in the MCP SDK's internal registry.
   - All 83 tools are registered before the transport connects.

6. **Transport connection**
   - In stdio mode: `StdioServerTransport` is connected and the process blocks reading from stdin.
   - In HTTP mode: a Node.js `http.Server` wraps a `StreamableHTTPServerTransport`. The server listens on `MCP_PORT` (default 3000). The port is logged to stderr.
   - SIGTERM and SIGINT handlers are registered for graceful shutdown.

## Request Flow

When Claude invokes a tool:

1. The MCP SDK receives a JSON-RPC `tools/call` request from the transport.
2. The SDK looks up the registered tool by name and validates the input against the tool's Zod schema. Schema errors are returned as MCP errors before the handler runs.
3. The handler function is called with the validated (and typed) arguments.
4. Most handlers call `EtherscanClient.get()` or `EtherscanClient.post()`, which:
   a. Constructs the Etherscan v2 URL: `https://api.etherscan.io/v2/api?chainid=N&module=X&action=Y&apikey=K&...`
   b. Wraps the fetch in `withRetry()`, which handles HTTP 429 and rate-limit messages with exponential backoff (500ms base, up to 3 attempts).
   c. Normalizes the response: JSON-RPC `error` objects, `status === "0"` API errors, and HTTP errors all throw a structured `Error` with a `code` property.
5. On success, the handler returns `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }`.
6. On error, the handler catches the exception, wraps it with `mcpError(code, err)` producing `{ error: true, code, message, details? }`, and returns `{ content: [...], isError: true }`.
7. The MCP SDK serializes the return value into a JSON-RPC response and sends it over the transport.

## Etherscan API Client

`EtherscanClient` (`src/etherscan/client.ts`) is a thin wrapper around the Etherscan v2 API. Key design decisions:

- **Single base URL:** Etherscan v2 uses `https://api.etherscan.io/v2/api` for all chains, with a `chainid` query parameter routing the request to the correct explorer backend. This means a single client instance can serve all chains.
- **Two methods:** `get()` for all read operations and `post()` for contract verification submissions. Both share the same retry logic.
- **Response normalization:** The v2 API mixes two response shapes — standard `{ status, result }` envelopes for most endpoints, and JSON-RPC `{ jsonrpc, error }` envelopes for the proxy endpoints. The client handles both.
- **Rate limit detection:** Both `HTTP 429` and message strings containing "rate limit", "Max rate" trigger retry. This handles Etherscan's inconsistent rate limit signaling.

## Persistent Store

`PersistentStore` (`src/db/store.ts`) is a zero-dependency, in-memory key-value map backed by a JSON file. Design properties:

- **Atomic writes:** Every flush writes to `<path>.tmp` first, then renames to `<path>`. A rename is atomic on POSIX filesystems, so the file is never left in a half-written state.
- **Debounced flushing:** `scheduleFlush()` uses `setImmediate()` to coalesce multiple writes in a single event-loop tick into one disk write. This means 50 `set()` calls in a handler produce one file write.
- **TTL eviction:** Entries are evicted lazily on read (`get()` deletes expired entries) and eagerly on flush (expired entries are excluded from the serialized output). There is no background timer.
- **Namespaces:** `store.ns("prefix")` returns a `Namespace` that prepends `"prefix:"` to every key. This keeps different subsystems' keys separate without requiring separate store files.

TTL constants defined in `store.ts`:

| Constant | Value | Used for |
|---|---|---|
| `TTL.CURSOR` | `0` (permanent) | `watch_events` block cursors |
| `TTL.ABI` | 24 hours | ABI cache (not currently used) |
| `TTL.SOURCE` | 24 hours | Verified source code in composite tools |
| `TTL.LABEL` | 1 hour | Address nametags in `trace_eth_flow` |

## remixd WebSocket Integration

The remixd daemon exposes six WebSocket services on fixed local ports:

| Port | Service |
|---|---|
| 65520 | Filesystem operations |
| 65521 | Git operations |
| 65522 | Hardhat |
| 65523 | Slither |
| 65524 | Truffle |
| 65525 | Foundry |

`RemixdManager` (`src/remixd/manager.ts`) manages the lifecycle of the remixd process:

- `start()` spawns remixd with `spawn()` (not `exec`), passing `-s <folder> -u <ideUrl>` and optionally `-r` for read-only. After 2 seconds it attempts to connect a `RemixdWSClient` to port 65520. If the connection fails, it retries up to 5 times with 1.5-second gaps.
- `stop()` sends SIGTERM to the child process and disconnects the WebSocket client.
- Framework detection (`detectFrameworks()`) checks for `hardhat.config.js/ts`, `truffle-config.js`, and `foundry.toml` in the shared folder and reports them in the status response.

`RemixdWSClient` (`src/remixd/ws-client.ts`) implements the remixd WebSocket handshake:

1. Client opens a WebSocket connection to `ws://127.0.0.1:65520` with the Remix IDE URL as the `origin` header.
2. remixd sends a handshake `request` message: `{ action: "request", key: "handshake" }`.
3. The client responds: `{ action: "request", key: "handshake", id: -1, payload: ["mcp-remixd-client"] }`.
4. remixd replies with a `response` message listing the available methods, completing the handshake.
5. Subsequent calls use `{ action: "request", key: "<method>", id: <N>, payload: [args] }` and match responses by `id`.
6. Each pending call has a 30-second timeout.

`FSClient` (`src/remixd/fs.ts`) provides the filesystem abstraction used by all filesystem tools. Its architecture has two layers:

1. **WebSocket layer:** If a `RemixdWSClient` is connected (`remixd?.filesystemWS`), the client sends the operation to remixd over the WebSocket. This keeps Remix IDE's file view synchronized with Claude's operations.
2. **Direct-fs fallback:** If the WebSocket is not connected (remixd not started, connection dropped, or WS call fails), the client falls back to Node.js `fs` module operations directly on the local filesystem. This means all filesystem tools work even without remixd running.

Path validation happens before either layer is attempted: `FSClient.safe()` resolves the relative path against the workspace root and throws `PATH_TRAVERSAL` if the result escapes the root.

## Caching Strategy

Caching is used in two places:

**Composite tool source cache** (`src/tools/composite.ts`):
- `fetchSource()` checks `store.ns("source").get(cacheKey)` before calling Etherscan.
- Cache key: `"${chainId}:${address.toLowerCase()}"`.
- TTL: 24 hours.
- This prevents redundant Etherscan calls when `diff_contracts`, `fetch_and_open`, and `audit_setup` are called with the same addresses.

**Address label cache** (`src/tools/composite.ts`, `trace_eth_flow`):
- For each unique address in the internal transaction list, `labelNs.get(cacheKey)` is checked before calling `get_address_label`.
- Cache key: `"${chainId}:${address}"`.
- TTL: 1 hour.
- Labels are fetched concurrently with `Promise.allSettled()`, so a failed label fetch (e.g., PRO gate) does not block the flow output.

**Event poller cursors** (`src/state/cursors.ts`):
- `watch_events` stores the next block number to query under `cursor:{address}:{chainId}:{topic0}`.
- No TTL — cursors are permanent until explicitly reset with `reset_cursor: true`.
- This allows `watch_events` to resume from the correct block even after a server restart.

## ABI Encoding and Decoding

`src/abi/codec.ts` wraps ethers v6's `Interface` class:

- `encodeCall(functionSignature, args)` — parses a human-readable signature like `"balanceOf(address) returns (uint256)"` and encodes the calldata.
- `decodeResult(functionSignature, resultHex)` — decodes the ABI-encoded return data. Returns a single unwrapped value when there is one return parameter, or an array for multiple.
- `decodeLog(abi, topics, data)` — parses a log against an ABI array and returns `{ name, args }`. Returns `null` on failure.
- `decodeCalldata(abi, calldata)` — parses transaction calldata against an ABI and returns `{ name, args }`. Returns `null` on failure.
- `serialise(val)` — recursively converts `BigInt` values to strings so that results can be passed to `JSON.stringify`. This is necessary because ethers v6 returns `bigint` for `uint256` values.

## Error Codes

All tool errors are returned as `McpErrorEnvelope`:

```typescript
{
  error:   true,
  code:    ErrorCodeKey,
  message: string,
  details?: unknown,
}
```

| Code | Meaning |
|---|---|
| `ETHERSCAN_API_ERROR` | Etherscan returned an error status or non-OK HTTP response |
| `REMIXD_NOT_RUNNING` | A remixd lifecycle operation failed |
| `FILE_NOT_FOUND` | The requested path does not exist |
| `COMPILE_ERROR` | The compiler (hardhat/truffle/forge) exited non-zero |
| `NOT_VERIFIED` | Contract source is not verified on Etherscan or Sourcify |
| `RATE_LIMITED` | Rate limit persisted after all retry attempts |
| `NETWORK_ERROR` | HTTP-level failure reaching the Etherscan API |
| `INVALID_PARAMS` | Input validation failed |
| `PATH_TRAVERSAL` | A filesystem path escapes the workspace root |
| `READ_ONLY_MODE` | A write was attempted when the workspace is read-only |

## Graceful Shutdown

On SIGTERM or SIGINT:

1. `remixd.stop()` — sends SIGTERM to the remixd child process and disconnects the WebSocket client.
2. `transport.close()` (HTTP mode only) — closes the HTTP transport.
3. `server.close()` — closes the MCP server.
4. `getStore().flushSync()` — synchronously writes any dirty store state to disk before the process exits.
5. `process.exit(0)`.

In stdio mode, the `process.on("exit", ...)` handler on the store also calls `flushSync()` as a safety net for unhandled exits.

## Module Boundaries

```
index.ts
  └── config.ts               (pure env reading, no side effects)
  └── db/store.ts             (singleton; initStore() called once)
  └── etherscan/client.ts     (stateless; constructed once)
  └── remixd/manager.ts       (stateful; owns child process)
      └── remixd/ws-client.ts (stateful; owns WebSocket)
  └── remixd/fs.ts            (delegates to ws-client or node:fs)
  └── tools/registry.ts
      └── tools/*.ts          (stateless; capture dependencies via closure)
          └── tools/schemas.ts (shared Zod primitives)
          └── abi/codec.ts     (pure functions)
          └── state/cursors.ts (reads/writes store via getStore())
          └── etherscan/sourcify.ts (stateless HTTP calls)
```

Each tool category file exports a single `register*()` function. Tool handlers capture their dependencies (the Etherscan client, FSClient, RemixdManager) via closure at registration time. This means there are no global mutable singletons in the tool layer — all state flows through the explicitly constructed objects passed to `registerAllTools()`.
