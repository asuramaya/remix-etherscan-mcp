# Tool Reference

This document describes every tool exposed by the remix-etherscan-mcp server. Tools are grouped into 15 categories. Each entry lists the tool name, a description, all parameters (with types and required/optional status), and the shape of a successful response.

All `chain_id` parameters are optional integers. When omitted, the value of `DEFAULT_CHAIN_ID` (default: `1`) is used.

All `address` parameters must be a 40-character hex string prefixed with `0x` (checksummed or lowercase).

All `tx_hash` parameters must be a 64-character hex string prefixed with `0x`.

On error, every tool returns `{ error: true, code: string, message: string, details?: unknown }` with `isError: true`.

---

## A — Accounts

### `get_balance`

Get native token (ETH) balance for one or more addresses.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `addresses` | `string` or `string[]` | Yes | One address or an array of up to 20 addresses |
| `chain_id` | `integer` | No | Chain ID (default: `DEFAULT_CHAIN_ID`) |
| `tag` | `string` | No | Block tag: `"latest"`, `"earliest"`, or a hex block number. Default: `"latest"` |

**Response shape:**

```json
[
  {
    "address": "0x...",
    "balance": "1234567890000000000",
    "balance_eth": "1.23456789"
  }
]
```

---

### `get_balance_history`

Historical native balance at a specific block number. Requires PRO API key.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Ethereum address |
| `block_number` | `integer` | Yes | Block number to query |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "address": "0x...",
  "block_number": 18000000,
  "balance": "1234567890000000000",
  "balance_eth": "1.23456789"
}
```

---

### `get_transactions`

Normal (external) transactions for an address.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Ethereum address |
| `start_block` | `integer` | No | Start block (inclusive, default: 0) |
| `end_block` | `integer` | No | End block (inclusive). Must be >= `start_block` if both provided |
| `page` | `integer` | No | Page number (default: 1) |
| `offset` | `integer` | No | Results per page, max 10000 (default: 100) |
| `sort` | `"asc"` or `"desc"` | No | Sort order by block number (default: `"asc"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of Etherscan transaction objects with fields including `hash`, `blockNumber`, `from`, `to`, `value`, `gasUsed`, `isError`, `input`, etc.

---

### `get_internal_transactions`

Internal transactions by address, transaction hash, or block range. Supply exactly one of: `address`, `tx_hash`, or both `start_block` and `end_block`.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Conditional | Filter by address (use alone, or omit when using tx_hash or block range) |
| `tx_hash` | `string` | Conditional | Filter by transaction hash |
| `start_block` | `integer` | Conditional | Start block for block-range query |
| `end_block` | `integer` | Conditional | End block for block-range query. Must be >= `start_block` |
| `page` | `integer` | No | Page number (default: 1) |
| `offset` | `integer` | No | Results per page, max 10000 (default: 100) |
| `sort` | `"asc"` or `"desc"` | No | Sort order (default: `"asc"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of internal transaction objects with `from`, `to`, `value`, `gas`, `type`, `isError`, `errCode`.

---

### `get_erc20_transfers`

ERC-20 token transfer events for an address, optionally filtered by token contract.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Wallet address to query |
| `contract_address` | `string` | No | Filter to a specific token contract |
| `start_block` | `integer` | No | Start block |
| `end_block` | `integer` | No | End block. Must be >= `start_block` |
| `page` | `integer` | No | Page number (default: 1) |
| `offset` | `integer` | No | Results per page, max 10000 (default: 100) |
| `sort` | `"asc"` or `"desc"` | No | Sort order (default: `"asc"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of ERC-20 transfer objects with `hash`, `from`, `to`, `value`, `tokenName`, `tokenSymbol`, `tokenDecimal`, `contractAddress`.

---

### `get_erc721_transfers`

ERC-721 (NFT) transfer events for an address.

**Parameters:** Same as `get_erc20_transfers` (replaces `contract_address` with the NFT contract address).

**Response shape:** Array of ERC-721 transfer objects with `hash`, `from`, `to`, `tokenID`, `tokenName`, `tokenSymbol`, `contractAddress`.

---

### `get_erc1155_transfers`

ERC-1155 multi-token transfer events for an address.

**Parameters:** Same structure as `get_erc20_transfers`.

**Response shape:** Array of ERC-1155 transfer objects with `hash`, `from`, `to`, `tokenID`, `tokenValue`, `tokenName`, `contractAddress`.

---

### `get_mined_blocks`

Blocks validated (mined) by an address.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Miner or validator address |
| `block_type` | `"blocks"` or `"uncles"` | No | Filter for regular blocks or uncle blocks (default: `"blocks"`) |
| `page` | `integer` | No | Page number (default: 1) |
| `offset` | `integer` | No | Results per page, max 10000 (default: 100) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of `{ blockNumber, timeStamp, blockReward }` objects.

---

## B — Contracts

### `get_contract_source`

Full verified source code, ABI, and compiler settings for a contract. Falls back to Sourcify if Etherscan has no source (controlled by `SOURCIFY_FALLBACK` env var).

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "contract_name": "UniswapV2Router02",
  "compiler_version": "v0.6.6+commit.6c089d02",
  "optimization_used": true,
  "runs": 999999,
  "evm_version": "istanbul",
  "license": "GPL-3.0",
  "is_proxy": false,
  "implementation": null,
  "abi": [ ... ],
  "source_files": {
    "contracts/UniswapV2Router02.sol": "pragma solidity ...",
    "contracts/interfaces/IUniswapV2Router02.sol": "..."
  },
  "constructor_arguments": "000000...",
  "verified": true,
  "source": "etherscan"
}
```

The `source` field is `"etherscan"` or `"sourcify"`. `verified` is `false` when no source was found on either platform.

---

### `get_contract_abi`

ABI only for a verified contract, as a parsed JSON array.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "address": "0x...",
  "abi": [
    { "type": "function", "name": "transfer", "inputs": [...], "outputs": [...] },
    ...
  ]
}
```

---

### `get_contract_creation`

Creator address and creation transaction hash for up to 5 contracts.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `addresses` | `string[]` | Yes | 1–5 contract addresses |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
[
  {
    "contractAddress": "0x...",
    "contractCreator": "0x...",
    "txHash": "0x..."
  }
]
```

---

### `verify_source`

Submit Solidity source code for Etherscan verification. Returns a GUID to poll with `check_verify_status`.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract_address` | `string` | Yes | Deployed contract address |
| `source_code` | `string` | Yes | Solidity source (flattened or standard JSON input) |
| `code_format` | `"solidity-single-file"` or `"solidity-standard-json-input"` | Yes | Format of `source_code` |
| `contract_name` | `string` | Yes | Contract name as declared in source |
| `compiler_version` | `string` | Yes | Solidity compiler version, e.g. `"v0.8.20+commit.a1b79de6"` |
| `optimization_used` | `boolean` | No | Whether optimizer was enabled (default: false) |
| `runs` | `integer` | No | Optimizer runs (default: 200) |
| `constructor_arguments` | `string` | No | ABI-encoded constructor arguments (hex, no 0x prefix) |
| `evm_version` | `string` | No | EVM target version (default: `"default"`) |
| `license_type` | `integer` | No | SPDX license type identifier (default: 1) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** `{ "guid": "abc123..." }`

---

### `verify_vyper`

Submit Vyper source code for Etherscan verification. Returns a GUID.

**Parameters:** Same as `verify_source` except the source is Vyper. The `code_format` field accepts the same enum values for API compatibility.

**Response shape:** `{ "guid": "abc123..." }`

---

### `check_verify_status`

Poll a verification job by GUID.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `guid` | `string` | Yes | GUID from `verify_source` or `verify_vyper` |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "status": "pass",
  "message": "Pass - Verified"
}
```

`status` is `"pass"`, `"fail"`, or `"pending"`.

---

### `verify_proxy`

Verify that a proxy contract points to the expected implementation address.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract_address` | `string` | Yes | Proxy contract address |
| `expected_implementation` | `string` | No | Expected implementation address (optional hint) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** `{ "guid": "abc123..." }` — poll with `check_proxy_verification`.

---

### `check_proxy_verification`

Poll proxy verification status.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract_address` | `string` | Yes | Proxy contract address |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Raw Etherscan proxy verification status object.

---

### `get_bytecode`

Raw deployed bytecode for any address.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract or EOA address |
| `tag` | `string` | No | Block tag (default: `"latest"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "address": "0x...",
  "bytecode": "0x608060405234801561001057600080fd5b50...",
  "is_contract": true
}
```

`is_contract` is `false` when `bytecode` is `"0x"` (EOA).

---

### `sourcify_submit`

Submit source files and compiler metadata to [Sourcify](https://sourcify.dev) for on-chain verification. The `files` map must include `metadata.json` (produced by `solc --metadata` or Foundry/Hardhat during compilation).

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `chain_id` | `integer` | Yes | EVM chain ID |
| `contract_address` | `string` | Yes | Deployed contract address to verify |
| `files` | `object` | Yes | Map of filename → file content. Must include `metadata.json`. |

**Response shape:** The raw Sourcify API response, which includes `result[].status` (`"perfect"`, `"partial"`, or `"false"`) and matched addresses.

---

### `get_similar_contracts`

Find contracts on Etherscan with bytecode similar to the given address. Useful for identifying proxy patterns, clones, or forks.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address to compare |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of similar contract records from Etherscan (address, similarity score, contract name where available).

---

## C — Transactions

### `get_transaction`

Full transaction object by hash.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `tx_hash` | `string` | Yes | Transaction hash |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Raw JSON-RPC `eth_getTransactionByHash` result with `hash`, `blockNumber`, `from`, `to`, `value`, `input`, `gas`, `gasPrice`, `nonce`, `v`, `r`, `s`.

---

### `get_transaction_receipt`

Transaction receipt including status, logs, gas used, and the contract address if deployment.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `tx_hash` | `string` | Yes | Transaction hash |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Raw JSON-RPC `eth_getTransactionReceipt` result with `status`, `gasUsed`, `logs`, `contractAddress`, `logsBloom`.

---

### `get_tx_logs`

All event logs emitted by a transaction, across every contract called. Optionally decode with a provided ABI.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `tx_hash` | `string` | Yes | Transaction hash |
| `chain_id` | `integer` | No | Chain ID |
| `abi` | `object[]` | No | ABI fragment array for decoding. If omitted, raw logs are returned |

**Response shape (without ABI):**

```json
{
  "tx_hash": "0x...",
  "log_count": 3,
  "logs": [
    {
      "address": "0x...",
      "topics": ["0x...", "0x..."],
      "data": "0x...",
      "blockNumber": "0x...",
      "transactionHash": "0x...",
      "logIndex": "0x0"
    }
  ]
}
```

**Response shape (with ABI):**

```json
{
  "tx_hash": "0x...",
  "log_count": 3,
  "decoded": [
    {
      "index": 0,
      "address": "0x...",
      "event": "Transfer",
      "args": { "from": "0x...", "to": "0x...", "value": "1000000000000000000" }
    },
    {
      "index": 1,
      "address": "0x...",
      "raw": { ... },
      "decoded": null
    }
  ]
}
```

---

### `get_transaction_status`

Lightweight success/fail check for a transaction.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `tx_hash` | `string` | Yes | Transaction hash |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "hash": "0x...",
  "success": true
}
```

---

## D — Blocks

### `get_block_by_number`

Full block object by number or tag.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `block_number` | `integer` or `"latest"` / `"earliest"` / `"pending"` | Yes | Block number or tag |
| `full_transactions` | `boolean` | No | Include full transaction objects (default: false, returns hashes only) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Raw JSON-RPC `eth_getBlockByNumber` result with `number`, `hash`, `parentHash`, `timestamp`, `miner`, `gasUsed`, `gasLimit`, `transactions`, etc.

---

### `get_block_by_timestamp`

Find the closest block number to a Unix timestamp.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `timestamp` | `integer` | Yes | Unix timestamp in seconds |
| `closest` | `"before"` or `"after"` | No | Whether to find the block before or after the timestamp (default: `"before"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "block_number": 18000000,
  "timestamp": 1693526400
}
```

---

### `get_block_rewards`

Miner reward and uncle rewards for a specific block.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `block_number` | `integer` | Yes | Block number |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Etherscan block reward object with `blockNumber`, `timeStamp`, `blockMiner`, `blockReward`, `uncles` array, `uncleInclusionReward`.

---

## E — Logs

### `get_logs_by_address`

Event logs emitted by a specific contract, paginated.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address |
| `from_block` | `integer` or `"latest"` | Yes | Start block |
| `to_block` | `integer` or `"latest"` | Yes | End block. Must be >= `from_block` when both are integers |
| `page` | `integer` | No | Page number (default: 1) |
| `offset` | `integer` | No | Results per page, max 10000 (default: 1000) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of log objects with `address`, `topics`, `data`, `blockNumber`, `transactionHash`, `logIndex`, `timeStamp`.

---

### `get_logs_by_topics`

Event logs filtered by up to 4 topic hashes with boolean operators between them.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `from_block` | `integer` | Yes | Start block. Must be <= `to_block` |
| `to_block` | `integer` | Yes | End block |
| `topic0` | `string` | Yes | First topic hash (event signature keccak256) |
| `topic1` | `string` | No | Second topic hash |
| `topic2` | `string` | No | Third topic hash |
| `topic3` | `string` | No | Fourth topic hash |
| `topic0_1_opr` | `"and"` or `"or"` | No | Operator between topic0 and topic1 |
| `topic0_2_opr` | `"and"` or `"or"` | No | Operator between topic0 and topic2 |
| `topic0_3_opr` | `"and"` or `"or"` | No | Operator between topic0 and topic3 |
| `topic1_2_opr` | `"and"` or `"or"` | No | Operator between topic1 and topic2 |
| `topic1_3_opr` | `"and"` or `"or"` | No | Operator between topic1 and topic3 |
| `topic2_3_opr` | `"and"` or `"or"` | No | Operator between topic2 and topic3 |
| `address` | `string` | No | Additional filter by contract address |
| `page` | `integer` | No | Page number (default: 1) |
| `offset` | `integer` | No | Results per page, max 10000 (default: 1000) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Same as `get_logs_by_address`.

---

## F — Tokens

### `get_token_info`

Rich token metadata including name, symbol, total supply, type, website, and social links. Requires PRO API key.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract_address` | `string` | Yes | Token contract address |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Etherscan token info object with `tokenName`, `symbol`, `divisor`, `tokenType`, `totalSupply`, `blueCheckmark`, `description`, `website`, `twitter`, `discord`, `officialSite`.

---

### `get_token_supply`

ERC-20 total supply in raw units and formatted (divided by 1e18).

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract_address` | `string` | Yes | Token contract address |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "contract_address": "0x...",
  "total_supply": "1000000000000000000000000",
  "total_supply_formatted": "1000000"
}
```

Note: `total_supply_formatted` divides by 1e18. For tokens with different decimals, use the raw `total_supply` and the token's decimals from `get_token_info`.

---

### `get_token_balance`

ERC-20 token balance for a wallet address at an optional block.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Wallet address |
| `contract_address` | `string` | Yes | Token contract address |
| `tag` | `string` | No | Block tag (default: `"latest"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "address": "0x...",
  "contract_address": "0x...",
  "balance": "1500000000000000000",
  "balance_formatted": "1.5"
}
```

---

### `get_token_balance_history`

ERC-20 token balance at a specific block number. Requires PRO API key.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Wallet address |
| `contract_address` | `string` | Yes | Token contract address |
| `block_number` | `integer` | Yes | Block number |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "balance": "1500000000000000000",
  "balance_formatted": "1.5",
  "block_number": 18000000
}
```

---

### `get_token_holder_count`

Number of unique addresses holding a token.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract_address` | `string` | Yes | Token contract address |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "contract_address": "0x...",
  "holder_count": 42000
}
```

---

### `get_token_holders`

Paginated list of token holders with balances. Requires PRO API key.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract_address` | `string` | Yes | Token contract address |
| `page` | `integer` | No | Page number (default: 1) |
| `offset` | `integer` | No | Results per page, max 10000 (default: 100) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of `{ TokenHolderAddress, TokenHolderQuantity }` objects.

---

## G — Gas

### `get_gas_oracle`

Current gas price tiers and EIP-1559 base fee.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Etherscan gas oracle object with `LastBlock`, `SafeGasPrice`, `ProposeGasPrice`, `FastGasPrice`, `suggestBaseFee`, `gasUsedRatio`.

---

### `estimate_confirmation_time`

Estimated confirmation time in seconds for a given gas price.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `gas_price_wei` | `string` | Yes | Gas price in wei as a decimal string |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "gas_price_wei": "20000000000",
  "estimated_seconds": 15
}
```

---

## H — Stats

### `get_eth_price`

Current ETH price in USD and BTC.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Etherscan price object with `ethbtc`, `ethbtc_timestamp`, `ethusd`, `ethusd_timestamp`.

---

### `get_eth_price_history`

Daily ETH closing price in USD over a date range. Requires PRO API key.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `start_date` | `string` | Yes | Start date in `YYYY-MM-DD` format |
| `end_date` | `string` | Yes | End date in `YYYY-MM-DD` format |
| `sort` | `"asc"` or `"desc"` | No | Sort order (default: `"asc"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of `{ UTCDate, unixTimeStamp, value }` objects.

---

### `get_eth_supply`

Total circulating ETH supply.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "supply_wei": "120450000000000000000000000",
  "supply_eth": "120450000"
}
```

---

### `get_eth_supply_v2`

ETH supply breakdown including circulating, staked, burned, and withdrawal amounts.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Etherscan v2 supply object with `EthSupply`, `Eth2Staking`, `BurntFees`, `WithdrawnTotal`.

---

### `get_daily_tx_count`

Daily transaction count over a date range. Requires PRO API key.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `start_date` | `string` | Yes | Start date `YYYY-MM-DD` |
| `end_date` | `string` | Yes | End date `YYYY-MM-DD` |
| `sort` | `"asc"` or `"desc"` | No | Sort order |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of `{ UTCDate, unixTimeStamp, transactionCount }` objects.

---

### `get_daily_gas_used`

Daily total gas consumed over a date range. Requires PRO API key. Same parameters as `get_daily_tx_count`.

**Response shape:** Array of `{ UTCDate, unixTimeStamp, gasUsed }` objects.

---

### `get_daily_avg_gas_price`

Daily minimum, average, and maximum gas price in wei. Requires PRO API key. Same parameters as `get_daily_tx_count`.

**Response shape:** Array of `{ UTCDate, unixTimeStamp, maxGasPrice_Wei, minGasPrice_Wei, avgGasPrice_Wei }` objects.

---

### `get_daily_block_count`

Daily block count and total block rewards. Requires PRO API key. Same parameters as `get_daily_tx_count`.

**Response shape:** Array of `{ UTCDate, unixTimeStamp, blockCount, blockRewards_Eth }` objects.

---

### `get_daily_block_size`

Daily average block size in bytes. Requires PRO API key. Same parameters as `get_daily_tx_count`.

**Response shape:** Array of `{ UTCDate, unixTimeStamp, blockSize_bytes }` objects.

---

### `get_daily_block_time`

Daily average block time in seconds. Requires PRO API key. Same parameters as `get_daily_tx_count`.

**Response shape:** Array of `{ UTCDate, unixTimeStamp, blockTime_sec }` objects.

---

### `get_daily_block_rewards`

Daily total block rewards in ETH. Requires PRO API key. Same parameters as `get_daily_tx_count`.

**Response shape:** Array of `{ UTCDate, unixTimeStamp, blockRewards_Eth }` objects.

---

### `get_daily_tx_fees`

Daily total transaction fees in ETH. Requires PRO API key. Same parameters as `get_daily_tx_count`.

**Response shape:** Array of `{ UTCDate, unixTimeStamp, transactionFee_Eth }` objects.

---

### `get_node_count`

Total discoverable Ethereum nodes.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Etherscan node count object with `UTCDate`, `TotalNodeCount`.

---

### `get_chain_size`

Blockchain size over a date range, filterable by client type and sync mode. Requires PRO API key.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `start_date` | `string` | No | Start date `YYYY-MM-DD` |
| `end_date` | `string` | No | End date `YYYY-MM-DD` |
| `client_type` | `"geth"` or `"parity"` | No | Client type filter |
| `sync_mode` | `"default"` or `"archive"` | No | Sync mode filter |
| `sort` | `"asc"` or `"desc"` | No | Sort order |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Array of `{ UTCDate, unixTimeStamp, chainSize_Bytes, clientType, syncMode }` objects.

---

## I — Proxy/EVM

### `eth_block_number`

Latest block number.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** `{ "block_number": 19500000 }`

---

### `eth_call`

Read-only contract call. Provide either raw `data` hex or `function_signature` plus `args` for automatic ABI encoding. The `from` field simulates `msg.sender` for access-control checks without sending a real transaction.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `to` | `string` | Yes | Contract address |
| `from` | `string` | No | Simulated sender address for `msg.sender` checks |
| `data` | `string` | Conditional | Raw calldata hex. Required if `function_signature` is not provided |
| `function_signature` | `string` | Conditional | Human-readable function signature, e.g. `"balanceOf(address) returns (uint256)"`. Required if `data` is not provided |
| `args` | `unknown[]` | No | Arguments for `function_signature` encoding |
| `abi` | `unknown[]` | No | Full ABI array (not used for encoding; reserved for future use) |
| `tag` | `string` | No | Block tag (default: `"latest"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "result_hex": "0x0000000000000000000000000000000000000000000000056bc75e2d63100000",
  "result_decoded": "100000000000000000000"
}
```

`result_decoded` is `null` when the signature's return type cannot be decoded.

---

### `eth_get_storage_at`

Raw storage slot value at a given address and position.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address |
| `position` | `string` | Yes | Storage slot position as hex string (e.g. `"0x0"`) |
| `tag` | `string` | No | Block tag (default: `"latest"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** `{ "value": "0x0000000000000000000000000000000000000000000000000000000000000001" }`

---

### `eth_get_code`

Contract bytecode at an address.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Address to query |
| `tag` | `string` | No | Block tag (default: `"latest"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "bytecode": "0x608060405234801561001057600080fd...",
  "is_contract": true
}
```

---

### `eth_get_transaction_count`

Address nonce (number of transactions sent).

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Address to query |
| `tag` | `string` | No | Block tag (default: `"latest"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** `{ "nonce": 42 }`

---

### `eth_gas_price`

Current gas price in wei and gwei.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "gas_price_wei": "20000000000",
  "gas_price_gwei": "20.0000"
}
```

---

### `eth_estimate_gas`

Gas estimate for a transaction.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `to` | `string` | No | Target contract address |
| `from` | `string` | No | Sender address |
| `data` | `string` | No | Calldata hex |
| `value` | `string` | No | ETH value in wei (hex) |
| `gas` | `string` | No | Gas limit override (hex) |
| `gas_price` | `string` | No | Gas price override (hex) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** `{ "gas_estimate": 21000 }`

---

### `eth_send_raw_transaction`

Broadcast a pre-signed raw transaction hex to the network. This is irreversible.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `signed_tx_hex` | `string` | Yes | RLP-encoded signed transaction hex |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** `{ "tx_hash": "0x..." }`

---

### `contract_read_multi`

Execute up to 50 `eth_call` operations on a single contract in one tool call. A 350ms delay is inserted between calls to respect Etherscan free-tier rate limits.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract` | `string` | Yes | Contract address for all calls |
| `calls` | `object[]` | Yes | 1–50 call specifications (see below) |
| `tag` | `string` | No | Block tag (default: `"latest"`) |
| `chain_id` | `integer` | No | Chain ID |

Each element in `calls`:

| Name | Type | Required | Description |
|---|---|---|---|
| `function_signature` | `string` | Yes | Human-readable signature, e.g. `"owner() returns (address)"` |
| `args` | `unknown[]` | No | Arguments |
| `label` | `string` | No | Human-readable label for this result |

**Response shape:**

```json
{
  "contract": "0x...",
  "results": [
    {
      "label": "owner",
      "function_signature": "owner() returns (address)",
      "result_hex": "0x000000000000000000000000...",
      "result_decoded": "0xAbCd..."
    }
  ]
}
```

---

### `ens_resolve`

Resolve an ENS name to an Ethereum address. Uses the mainnet ENS registry (`0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e`) via two sequential `eth_call` operations: one to find the resolver, one to resolve the address.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | Yes | ENS name, e.g. `"vitalik.eth"` |
| `chain_id` | `integer` | No | Chain ID (must be 1 for mainnet ENS) |

**Response shape:**

```json
{
  "name": "vitalik.eth",
  "namehash": "0xee6c4522aab0003e8d14cd40a6af439055fd2577951148c14b6cea9a53475835",
  "resolver": "0x...",
  "address": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
}
```

---

### `read_proxy_slots`

Read standard proxy storage slots from a contract to identify proxy targets without requiring verified source code.

Slots read:

| Name | Slot |
|---|---|
| `eip1967_implementation` | `0x360894a13ba1a3210667c828492db98dca3e2076635130ab13d11325969a32b` |
| `eip1967_admin` | `0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103` |
| `eip1967_beacon` | `0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50` |
| `oz_implementation` | `0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3` |

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address to inspect |
| `tag` | `string` | No | Block tag (default: `"latest"`) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:**

```json
{
  "address": "0x...",
  "implementation": "0xLogicContractAddress",
  "proxy_slots": {
    "eip1967_implementation": {
      "slot": "0x360894...",
      "raw": "0x000000000000000000000000LogicContractAddress",
      "address": "0xLogicContractAddress"
    },
    "eip1967_admin": {
      "slot": "0xb53127...",
      "raw": "0x0000...0000",
      "address": null
    }
  }
}
```

`implementation` is the first non-null address found across the EIP-1967 and OpenZeppelin slots.

---

### `eth_get_uncle`

Uncle block by block number and uncle index.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `block_number` | `integer` or `string` | Yes | Block number (or hex string) containing the uncle |
| `uncle_index` | `integer` | Yes | Index of the uncle within the block (0-based) |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Raw JSON-RPC uncle block object.

---

### `multicall`

Batch multiple contract read calls into a single RPC round-trip using [Multicall3](https://github.com/mds1/multicall) deployed at `0xcA11bde05977b3631167028862bE2a173976CA11` on Ethereum, Polygon, Arbitrum, Optimism, Base, Avalanche, BNB Chain, and most other EVM chains.

Each call specifies a target address and function signature. Results are decoded in order. With `allow_failure: true` (the default), a single failed call does not revert the batch — its `success` field is `false` and `revert` contains the decoded error.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `calls` | `object[]` | Yes | Array of calls, min 1 max 100. Each has: `address` (target), `function_sig` (with return types), `args` (optional), `allow_failure` (default: `true`) |
| `chain_id` | `integer` | No | Chain ID |
| `block_tag` | `string` | No | Block tag (default: `"latest"`) |

**Response shape:**

```json
{
  "call_count": 3,
  "results": [
    {
      "address":      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "function_sig": "name() returns (string)",
      "success":      true,
      "result":       "USD Coin",
      "raw_hex":      "0x0000..."
    },
    {
      "address":      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      "function_sig": "totalSupply() returns (uint256)",
      "success":      true,
      "result":       "44000000000000",
      "raw_hex":      "0x0000..."
    },
    {
      "address":      "0xdead000000000000000000000000000000000000",
      "function_sig": "owner() returns (address)",
      "success":      false,
      "result":       null,
      "revert":       { "type": "empty", "message": "revert with no data" },
      "raw_hex":      "0x"
    }
  ]
}
```

---

### `call_contract`

Call any view or pure function on a deployed contract. Encodes the arguments using the function signature, executes `eth_call`, and decodes the return value — no full ABI JSON required.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address |
| `function_sig` | `string` | Yes | Function signature with return types. Examples: `"balanceOf(address) returns (uint256)"`, `"name() returns (string)"`, `"getReserves() returns (uint112,uint112,uint32)"` |
| `args` | `array` | No | Function arguments in order. Addresses as `0x` strings; numbers as strings or JS numbers for small values. |
| `chain_id` | `integer` | No | Chain ID |
| `block_tag` | `string` | No | Block tag: `"latest"`, `"earliest"`, `"pending"`, or a hex block number (default: `"latest"`) |

**Response shape:**

```json
{
  "address":      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "function_sig": "balanceOf(address) returns (uint256)",
  "args":         ["0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"],
  "result":       "1500000000",
  "raw_hex":      "0x0000000000000000000000000000000000000000000000000000000059682f00"
}
```

`result` is the decoded return value (string for uint/int/address, boolean for bool, array for tuple returns). If decoding fails, `result` equals `raw_hex`.

---

### `simulate_transaction`

Simulate a transaction using `eth_call` with a specific sender and optional ETH value. Decodes the return value if a function signature is provided. On revert, automatically decodes the error data via `decode_error` logic.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `to` | `string` | Yes | Target contract address |
| `from` | `string` | No | Sender address for simulation (sets `msg.sender`) |
| `function_sig` | `string` | No | Function signature with return types. Omit to send raw data. |
| `args` | `array` | No | Function arguments (used when `function_sig` is provided) |
| `data` | `string` | No | Raw calldata hex. Used when `function_sig` is not provided. |
| `value` | `string` | No | ETH value in wei (hex or decimal string, e.g. `"1000000000000000000"` for 1 ETH) |
| `chain_id` | `integer` | No | Chain ID |
| `block_tag` | `string` | No | Block tag (default: `"latest"`) |

**Response shape (success):**

```json
{
  "to":           "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "from":         "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "function_sig": "transfer(address,uint256) returns (bool)",
  "reverted":     false,
  "result":       true,
  "revert":       null,
  "raw_hex":      "0x0000000000000000000000000000000000000000000000000000000000000001"
}
```

**Response shape (revert):**

```json
{
  "to":           "0x...",
  "from":         "0x...",
  "function_sig": "transfer(address,uint256) returns (bool)",
  "reverted":     true,
  "result":       null,
  "revert":       { "type": "Error", "message": "ERC20: transfer amount exceeds balance" },
  "raw_hex":      "0x08c379a0..."
}
```

---

## J — Chains

### `get_supported_chains`

All chains supported by Etherscan v2 with their current live status.

**Parameters:** None.

**Response shape:** Array of chain objects with `chainname`, `chainid`, `blockexplorer`, `apiurl`, `status`.

---

### `get_address_label`

Human-readable nametag, labels, and reputation for any address. Requires PRO Plus API key.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Address to look up |
| `chain_id` | `integer` | No | Chain ID |

**Response shape:** Etherscan address tag object with `address`, `nameTag`, and reputation information.

---

## K — remixd Lifecycle

### `remixd_start`

Start the remixd daemon. Shares a local folder with Remix IDE over WebSocket on ports 65520–65525. After spawning the process, the server waits 2 seconds then connects a WebSocket client to port 65520.

If remixd is already running, returns an error. Call `remixd_stop` first.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `folder` | `string` | No | Workspace folder to share (overrides `REMIXD_WORKSPACE`) |
| `read_only` | `boolean` | No | Prevent writes from Remix IDE (overrides `REMIXD_READ_ONLY`) |
| `remix_ide_url` | `string` | No | Remix IDE URL for CORS (overrides `REMIX_IDE_URL`) |

**Response shape:**

```json
{
  "running": true,
  "pid": 12345,
  "folder": "/path/to/workspace",
  "readOnly": false,
  "connectedClients": 0,
  "detectedFrameworks": ["hardhat"],
  "websocket_connected": false,
  "services": {
    "filesystem": { "port": 65520, "url": "ws://127.0.0.1:65520" },
    "git":        { "port": 65521, "url": "ws://127.0.0.1:65521" },
    "hardhat":    { "port": 65522, "url": "ws://127.0.0.1:65522", "detected": true },
    "slither":    { "port": 65523, "url": "ws://127.0.0.1:65523" },
    "truffle":    { "port": 65524, "url": "ws://127.0.0.1:65524", "detected": false },
    "foundry":    { "port": 65525, "url": "ws://127.0.0.1:65525", "detected": false }
  }
}
```

`websocket_connected` may be `false` immediately after start; it becomes `true` once the WS handshake completes (about 2 seconds).

---

### `remixd_stop`

Gracefully stop the running remixd daemon.

**Parameters:** None.

**Response shape:** `{ "stopped": true, "pid": 12345 }`

---

### `remixd_status`

Current remixd daemon status.

**Parameters:** None.

**Response shape:** Same as `remixd_start`. `running` is `false` if the daemon is not active.

---

## L — Filesystem

All filesystem paths are relative to the workspace root (`REMIXD_WORKSPACE`). Absolute paths and `../` path traversal are rejected with a `PATH_TRAVERSAL` error. Write operations are rejected with `READ_ONLY_MODE` when `REMIXD_READ_ONLY=true`.

When remixd is running with a connected WebSocket, filesystem operations are routed through the WebSocket so Remix IDE stays in sync. When remixd is not running or the WebSocket is disconnected, operations fall back to direct Node.js `fs` calls.

---

### `fs_list`

Directory tree of the remixd workspace.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | No | Subdirectory to list (default: workspace root `"."`) |
| `max_depth` | `integer` | No | Maximum recursion depth (default: unlimited) |

**Response shape:**

```json
{
  "name": ".",
  "path": ".",
  "type": "directory",
  "children": [
    { "name": "contracts", "path": "contracts", "type": "directory", "children": [...] },
    { "name": "hardhat.config.ts", "path": "hardhat.config.ts", "type": "file" }
  ]
}
```

Hidden files (starting with `.`) are skipped, except `.gitignore`.

---

### `fs_read`

Read a file's content from the workspace.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | File path relative to workspace root |
| `max_bytes` | `integer` | No | Truncate to this many bytes if the file is larger |

**Response shape:**

```json
{
  "path": "contracts/Token.sol",
  "content": "// SPDX-License-Identifier: MIT\npragma solidity ...",
  "sizeBytes": 4096,
  "truncated": false,
  "size_warning": null
}
```

When the file exceeds 500 KB, `size_warning` contains a message. When `max_bytes` is set and the file exceeds it, `truncated` is `true` and `content` is the first `max_bytes` bytes.

---

### `fs_write`

Write content to a file. Parent directories are created automatically.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | File path relative to workspace root |
| `content` | `string` | Yes | File content (UTF-8) |

**Response shape:** `{ "path": "contracts/Token.sol", "written": true, "sizeBytes": 4096 }`

---

### `fs_exists`

Check if a path exists.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | Path to check |

**Response shape:** `{ "path": "contracts/Token.sol", "exists": true }`

---

### `fs_is_file`

True if the path is a regular file.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | Path to check |

**Response shape:** `{ "path": "contracts/Token.sol", "is_file": true }`

---

### `fs_is_directory`

True if the path is a directory.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | Path to check |

**Response shape:** `{ "path": "contracts", "is_directory": true }`

---

### `fs_create_dir`

Create a directory recursively.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | Directory path to create |

**Response shape:** `{ "path": "contracts/interfaces", "created": true }`

---

### `fs_rename`

Rename or move a file or directory.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `old_path` | `string` | Yes | Current path |
| `new_path` | `string` | Yes | New path |

**Response shape:** `{ "success": true }`

---

### `fs_remove`

Delete a file or directory recursively. Requires explicit confirmation.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | Path to delete |
| `confirm` | `true` (literal) | Yes | Must be the boolean `true`; the schema rejects any other value |

**Response shape:** `{ "path": "old-contracts", "removed": true }`

---

### `fs_search`

Search workspace files for a string or regex pattern. Returns matching lines with file path and line number.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `pattern` | `string` | Yes | Search string or regex pattern |
| `path` | `string` | No | Directory to search in (default: workspace root) |
| `use_regex` | `boolean` | No | Treat `pattern` as a regular expression (default: false) |
| `file_glob` | `string` | No | File filter glob pattern. Bare extensions like `.sol` are treated as `*.sol`. Supports `*` (any segment), `**` (any path), and `?` (any char). |

**Response shape:**

```json
{
  "count": 3,
  "matches": [
    { "file": "contracts/Token.sol", "line": 42, "content": "    require(msg.sender == owner);" },
    { "file": "contracts/Vault.sol", "line": 18, "content": "    require(msg.sender == owner);" }
  ]
}
```

---

### `fs_stat`

Stat a path: type, size in bytes, and last-modified timestamp.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `path` | `string` | Yes | Path to stat |

**Response shape:**

```json
{
  "path": "contracts/Token.sol",
  "type": "file",
  "sizeBytes": 4096,
  "mtimeMs": 1700000000000
}
```

---

### `fs_copy`

Copy a file or directory recursively. Creates parent directories at the destination.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `src` | `string` | Yes | Source path |
| `dest` | `string` | Yes | Destination path |

**Response shape:** `{ "src": "contracts/Token.sol", "dest": "backup/Token.sol", "copied": true }`

---

### `fs_diff`

Generate a unified diff between two files in the workspace. If either file does not exist it is treated as empty content, producing a one-sided diff.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `src` | `string` | Yes | Source file path (relative to workspace) |
| `dest` | `string` | Yes | Destination file path (relative to workspace) |

**Response shape:**

```json
{
  "src": "contracts/Token.sol",
  "dest": "contracts/TokenV2.sol",
  "patch": "===...\n--- contracts/Token.sol\n+++ contracts/TokenV2.sol\n@@...",
  "hunks": 2
}
```

`patch` is a unified diff string produced by the `diff` package. `hunks` is the count of `@@` hunk headers.

---

## M — Git

### `git_exec`

Execute a git command in the remixd shared folder. Uses `execFile` (not a shell) to prevent command injection. Shell operators (`;`, `&&`, `|`, `>`, `` ` ``, `$`, `()`, `{}`, `[]`) and newlines in the command string are rejected by schema validation. Dangerous flags (`--upload-pack`, `--receive-pack`, `--exec`, `--local-port`, `--proxy-command`) are also blocked.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `command` | `string` | Yes | Git command string starting with `git `. Example: `"git log --oneline -10"` |

**Response shape:**

```json
{
  "command": "git log --oneline -10",
  "stdout": "abc1234 Add transfer restrictions\ndef5678 Initial commit\n",
  "stderr": "",
  "exit_code": 0
}
```

On non-zero exit, `exit_code` reflects the git exit status and `stderr` contains the error output.

---

### `git_blame`

Structured line-by-line blame for a file.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | Yes | File path relative to the workspace root |
| `start_line` | `integer` | No | First line to annotate, 1-based inclusive |
| `end_line` | `integer` | No | Last line to annotate, 1-based inclusive. Must be >= `start_line` |

**Response shape:**

```json
{
  "file": "contracts/Token.sol",
  "line_count": 3,
  "lines": [
    {
      "line": 42,
      "commit": "abc1234567890abcdef...",
      "author": "Alice",
      "author_email": "alice@example.com",
      "timestamp": 1700000000,
      "summary": "Add transfer restrictions",
      "content": "    require(msg.sender == owner);"
    }
  ]
}
```

---

## N — Compilation

Compilation tools run in the remixd shared folder (`REMIXD_WORKSPACE`). All tools have a 120-second timeout.

### `compile_hardhat`

Run `npx hardhat compile` in the workspace. Requires `hardhat.config.js` or `hardhat.config.ts` in the workspace root.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `config_path` | `string` | No | Custom config file path (passed as `--config`) |
| `force` | `boolean` | No | Force recompile all files (passes `--force`) |

**Response shape:**

```json
{
  "success": true,
  "compiler_version": "hardhat",
  "contracts": {
    "Token": {
      "abi": [...],
      "bytecode": "0x608060...",
      "deployedBytecode": "0x608060..."
    }
  },
  "errors": [],
  "warnings": [
    { "severity": "warning", "file": "contracts/Token.sol", "line": 5, "col": 3, "message": "..." }
  ]
}
```

On compiler failure, returns `COMPILE_ERROR` with `stderr` in `details`.

---

### `compile_truffle`

Run `npx truffle compile` in the workspace. Requires `truffle-config.js` in the workspace root.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `config_path` | `string` | No | Custom config file path |
| `force` | `boolean` | No | Force recompile all files (passes `--all`) |

**Response shape:** Same structure as `compile_hardhat`.

---

### `compile_foundry`

Run `forge build` in the workspace. Requires `foundry.toml` in the workspace root.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `force` | `boolean` | No | Force recompile all files (passes `--force`) |

**Response shape:**

```json
{
  "success": true,
  "compiler_version": "forge",
  "contracts": {
    "Token": {
      "abi": [...],
      "bytecode": "0x608060...",
      "deployedBytecode": "0x608060..."
    }
  },
  "gas_estimates": {
    "Token": {
      "creation": { "codeDepositCost": "123456", "executionCost": "78900" },
      "external": { "transfer(address,uint256)": "30000" }
    }
  },
  "errors": [],
  "warnings": []
}
```

---

### `compile_slither`

Run Slither static security analysis on the workspace. Returns structured findings grouped by severity. Requires `slither` to be installed (`pip install slither-analyzer`).

If Slither is not installed, the tool returns `{ "available": false, "error": "slither not installed — run: pip install slither-analyzer" }` without an error status — the tool degrades gracefully.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `target` | `string` | No | Target file or directory relative to the workspace (default: `"."`) |
| `solc_version` | `string` | No | Specific `solc` version to use (e.g. `"0.8.20"`) |
| `filter_paths` | `string[]` | No | Paths to exclude from analysis (comma-joined and passed as `--filter-paths`) |

**Response shape:**

```json
{
  "success": true,
  "findings": [
    {
      "title": "reentrancy-eth",
      "description": "Reentrancy in Token.withdraw()...",
      "severity": "High",
      "confidence": "Medium",
      "check": "reentrancy-eth",
      "locations": [
        { "file": "contracts/Token.sol", "lines": [45, 46, 47] }
      ]
    }
  ],
  "summary": { "high": 1, "medium": 2, "low": 0, "informational": 3, "optimization": 1 },
  "stderr": "..."
}
```

---

### `run_forge_test`

Run Forge tests in the remixd workspace using `forge test --json`. Returns structured pass/fail counts and per-suite results.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `match_test` | `string` | No | Filter tests by function name (passed to `--match-test`) |
| `match_contract` | `string` | No | Filter by contract name (`--match-contract`) |
| `verbosity` | `integer` | No | Verbosity level 1–5 (default: 2) |

**Response shape:**

```json
{
  "passed": 12,
  "failed": 1,
  "suite": {
    "CounterTest": {
      "test_results": {
        "test_increment": { "status": "Success", "gas": 25814 },
        "test_decrement_underflow": { "status": "Failure", "gas": 8042 }
      }
    }
  },
  "stderr": "..."
}
```

---

### `run_hardhat_test`

Run Hardhat tests using `npx hardhat test`. Parses Mocha pass/fail/pending counts from output.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `test_files` | `string[]` | No | Specific test file paths to run (relative) |
| `grep` | `string` | No | Only run tests matching this string (`--grep`) |

**Response shape:**

```json
{
  "passed": 18,
  "failed": 0,
  "pending": 2,
  "output": "  Token contract\n    ✓ should have correct name (42ms)\n    ✓ should transfer tokens\n  18 passing (1s)\n  2 pending"
}
```

---

### `compile_vyper`

Compile a Vyper (`.vy`) source file using the `vyper` CLI. Returns ABI, bytecode, and structured diagnostics.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `file` | `string` | Yes | Relative path to the `.vy` file in the workspace |
| `format` | `string` | No | Output format: `"abi"`, `"bytecode"`, or `"abi,bytecode"` (default: `"abi,bytecode"`) |

**Response shape:**

```json
{
  "success": true,
  "file": "contracts/Token.vy",
  "abi": [ { "type": "function", "name": "transfer", ... } ],
  "bytecode": "0x61...",
  "raw": "..."
}
```

On error, `success` is `false` and `diagnostics` contains structured `{ file, line, col, severity, message }` entries.

---

## O — Composite

Composite tools combine multiple lower-level operations into single-step workflows. They are the primary entry points for audit tasks.

### `fetch_and_open`

Fetch verified source code for a contract, write all source files to the workspace, and optionally start the remixd daemon. Falls back to Sourcify if Etherscan has no source. Source is cached for 24 hours.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address |
| `chain_id` | `integer` | No | Chain ID |
| `workspace_subdir` | `string` | No | Subdirectory in workspace to write files to (default: contract name) |
| `start_remixd` | `boolean` | No | Start remixd if not running (default: true) |
| `overwrite` | `boolean` | No | Overwrite existing files (default: true) |

**Response shape:**

```json
{
  "contract_name": "UniswapV2Router02",
  "compiler_version": "v0.6.6+commit.6c089d02",
  "source": "etherscan",
  "address": "0x...",
  "chain_id": 1,
  "files_written": [
    "UniswapV2Router02/contracts/UniswapV2Router02.sol",
    "UniswapV2Router02/abi.json"
  ],
  "files_skipped": [],
  "workspace_path": "/path/to/workspace/UniswapV2Router02",
  "remixd_url": "ws://127.0.0.1:65520",
  "remix_ide_url": "https://remix.ethereum.org/#activate=remixd",
  "remixd": { "running": true, ... }
}
```

---

### `diff_contracts`

Fetch verified source for two contract addresses (optionally on different chains) and return a unified diff of every changed file. Detects renames by comparing file contents.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address_a` | `string` | Yes | First contract address |
| `address_b` | `string` | Yes | Second contract address |
| `chain_id_a` | `integer` | No | Chain ID for `address_a` (default: `DEFAULT_CHAIN_ID`) |
| `chain_id_b` | `integer` | No | Chain ID for `address_b` (default: same as `chain_id_a`) |
| `context_lines` | `integer` | No | Lines of context around each diff hunk (default: 3) |

**Response shape:**

```json
{
  "name_a": "UniswapV2Router02",
  "address_a": "0x...",
  "name_b": "UniswapV2Router03",
  "address_b": "0x...",
  "files_renamed": [{ "from": "OldName.sol", "to": "NewName.sol" }],
  "files_only_in_a": ["DeprecatedHelper.sol"],
  "files_only_in_b": ["NewFeature.sol"],
  "files_changed": [
    {
      "path": "contracts/Router.sol",
      "diff": "--- a/contracts/Router.sol\n+++ b/contracts/Router.sol\n@@ ..."
    }
  ],
  "files_identical": ["contracts/interfaces/IRouter.sol"],
  "summary": {
    "changed_files": 1,
    "renamed_files": 1,
    "only_in_a": 1,
    "only_in_b": 1,
    "identical": 1
  }
}
```

---

### `decode_transaction`

Fetch a transaction and its receipt, decode calldata and all emitted events using the contract ABI. Fetches the ABI automatically from Etherscan if not provided.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `tx_hash` | `string` | Yes | Transaction hash |
| `chain_id` | `integer` | No | Chain ID |
| `abi` | `object[]` | No | ABI fragment array. If omitted, fetched from Etherscan for the target contract |

**Response shape:**

```json
{
  "hash": "0x...",
  "block_number": 19000000,
  "timestamp": 1700000000,
  "from": "0x...",
  "to": "0x...",
  "value_eth": "0.000000 ETH",
  "status": "success",
  "gas_used": 85000,
  "function_call": {
    "name": "transfer",
    "args": { "recipient": "0x...", "amount": "1000000000000000000" }
  },
  "events": [
    {
      "address": "0x...",
      "log_index": 0,
      "decoded": { "name": "Transfer", "args": { "from": "0x...", "to": "0x...", "value": "1000000000000000000" } }
    }
  ],
  "internal_calls": [
    { "from": "0x...", "to": "0x...", "value_eth": "0.000000 ETH", "type": "call" }
  ]
}
```

`function_call` is `null` for contract deployments or when calldata cannot be decoded. `events` entries include `raw` instead of `decoded` when an event cannot be matched to the ABI.

---

### `audit_setup`

Full audit bootstrap in a single call: fetch verified source, write files to workspace, start remixd, and optionally run Slither. Designed as the entry point for auditing a new contract.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address to audit |
| `chain_id` | `integer` | No | Chain ID |
| `workspace_subdir` | `string` | No | Workspace subdirectory (default: contract name) |
| `run_slither` | `boolean` | No | Run Slither after writing files (default: true) |

**Response shape:**

```json
{
  "fetch_result": {
    "contract_name": "Vault",
    "compiler_version": "v0.8.20+commit.a1b79de6",
    "source": "etherscan",
    "files_written": ["Vault/contracts/Vault.sol", "Vault/abi.json"],
    "workspace_path": "/path/to/workspace/Vault",
    "remixd_url": "ws://127.0.0.1:65520",
    "remix_ide_url": "https://remix.ethereum.org/#activate=remixd",
    "remixd": { "running": true, ... }
  },
  "slither_result": {
    "available": true,
    "findings": [...],
    "summary": { "high": 0, "medium": 1, "low": 2, "informational": 5, "optimization": 0 },
    "stderr": "..."
  }
}
```

When Slither is not installed, `slither_result` is `{ "available": false, "error": "slither not installed — run: pip install slither-analyzer" }` and the rest of the audit setup is still returned successfully.

---

### `trace_eth_flow`

Walk all internal transactions for a transaction hash and return a labelled ETH flow list. Optionally enriches addresses with nametags (requires PRO API key). Nametags are cached for 1 hour.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `tx_hash` | `string` | Yes | Transaction hash |
| `chain_id` | `integer` | No | Chain ID |
| `label_addresses` | `boolean` | No | Fetch and attach nametags for each address (default: true; requires PRO) |

**Response shape:**

```json
{
  "tx_hash": "0x...",
  "total_eth_moved": "1.234567 ETH",
  "flow": [
    {
      "from": "0xabc...",
      "from_label": "Uniswap V3: Router",
      "to": "0xdef...",
      "to_label": null,
      "value_eth": "1.234567 ETH",
      "type": "call"
    }
  ],
  "unique_addresses": [
    { "address": "0xabc...", "label": "Uniswap V3: Router", "role": "sender" },
    { "address": "0xdef...", "label": null, "role": "recipient" }
  ]
}
```

Address labels are fetched concurrently with `Promise.allSettled()`, so a missing PRO key does not block the output; labels are simply `null`.

---

### `watch_events`

Stateful event poller. Call repeatedly to stream new event logs since the last call. The cursor (next block to query from) is stored in the persistent store and survives server restarts. Each unique `(address, chain_id, topic0)` combination has its own cursor.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address to watch |
| `chain_id` | `integer` | No | Chain ID |
| `topic0` | `string` | No | Event signature hash to filter (32-byte hex with 0x prefix) |
| `abi` | `object[]` | No | ABI fragment array for decoding log events |
| `from_block` | `integer` | No | Starting block for the first call (ignored on subsequent calls; cursor takes precedence) |
| `max_blocks` | `integer` | No | Cap the scan window: `toBlock = fromBlock + max_blocks`. Prevents unexpectedly large scans on first call. |
| `page_size` | `integer` | No | Maximum events per call, max 1000 (default: 100) |
| `reset_cursor` | `boolean` | No | Clear the stored cursor and restart from `from_block` (default: false) |

**Response shape:**

```json
{
  "new_logs": [
    {
      "blockNumber": "0x...",
      "transactionHash": "0x...",
      "topics": ["0x...", "0x..."],
      "data": "0x...",
      "logIndex": "0x0",
      "decoded": { "name": "Transfer", "args": { "from": "0x...", "to": "0x...", "value": "1000000" } }
    }
  ],
  "cursor_block": 19500001,
  "log_count": 5
}
```

On the next call, the query starts from `cursor_block`. When `log_count` is 0, the cursor is unchanged and no new events have been emitted.

---

### `get_events`

Fetch and decode historical events for a contract over an explicit block range. Automatically paginates up to `max_pages` to collect more than one page of logs. Unlike `watch_events`, this tool is stateless — it does not maintain a cursor.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `address` | `string` | Yes | Contract address |
| `chain_id` | `integer` | No | Chain ID |
| `topic0` | `string` | No | Event signature hash to filter (32-byte hex) |
| `from_block` | `integer` | Yes | Start block (inclusive) |
| `to_block` | `integer \| "latest"` | No | End block (default: `"latest"`) |
| `abi` | `object[]` | No | ABI to decode matching events |
| `page_size` | `integer` | No | Logs per page, max 1000 (default: 200) |
| `max_pages` | `integer` | No | Maximum pages to fetch, max 20 (default: 5). Total logs = `page_size × max_pages`. |

**Response shape:**

```json
{
  "log_count": 47,
  "from_block": 19000000,
  "to_block": "latest",
  "block_range": { "min": 19000012, "max": 19002341 },
  "logs": [
    {
      "blockNumber": "0x121f50c",
      "transactionHash": "0x...",
      "topics": ["0x..."],
      "data": "0x...",
      "decoded": { "name": "Transfer", "args": { "from": "0x...", "to": "0x...", "value": "500" } }
    }
  ]
}
```

---

## P — Analysis

### `decode_error`

Decode hex-encoded revert data from a failed transaction or `eth_call`. Handles the three standard EVM revert formats plus custom errors defined in an ABI.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `revert_data` | `string` | Yes | Hex-encoded revert bytes (e.g. from `eth_call` error result) |
| `abi` | `object[]` | No | ABI containing `error` type entries for custom error decoding |

**Response shape:**

`Error(string)`:
```json
{ "type": "Error", "message": "ERC20: transfer amount exceeds balance" }
```

`Panic(uint256)`:
```json
{ "type": "Panic", "code": "0x11", "message": "arithmetic overflow/underflow" }
```

Custom error:
```json
{ "type": "custom", "name": "InsufficientBalance", "args": { "available": "100", "required": "200" } }
```

Empty revert (`0x`):
```json
{ "type": "empty", "message": "revert with no data" }
```

Unknown selector:
```json
{ "type": "unknown", "selector": "0xdeadbeef", "raw": "0xdeadbeef...", "message": "could not decode — pass an ABI containing the error definition" }
```

---

### `decode_storage`

Read and decode on-chain storage variables using a solc or Foundry storage layout JSON. Supports all inplace scalar types: `uint`, `int`, `bool`, `address`, `bytesN`. Packed variables at non-zero byte offsets are correctly extracted. Mappings and dynamic arrays cannot be decoded without a key and are reported in `skipped`.

Obtain the storage layout with: `forge inspect <ContractName> storageLayout` or `solc --storage-layout`.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `contract_address` | `string` | Yes | Deployed contract address |
| `chain_id` | `integer` | No | Chain ID |
| `layout` | `object` | Yes | Storage layout JSON with `storage` array and `types` map |
| `variables` | `string[]` | No | Variable names to decode (default: all inplace scalars) |

**Response shape:**

```json
{
  "results": {
    "owner":       "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "totalSupply": "1000000000000000000000",
    "paused":      false
  },
  "skipped": ["_balances", "_allowances"],
  "address": "0x..."
}
```

`skipped` contains variable names whose type is not `inplace` (e.g. mappings, dynamic arrays).

---

### `safe_decode`

Decode Gnosis Safe `execTransaction` calldata into its ten parameters. Optionally decodes the inner `data` field against a provided ABI.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `calldata` | `string` | Yes | `execTransaction` calldata hex |
| `inner_abi` | `object[]` | No | ABI for decoding the `data` field of the inner transaction |

**Response shape:**

```json
{
  "to": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  "value": "0",
  "data": "0xa9059cbb...",
  "operation": 0,
  "operation_name": "CALL",
  "safeTxGas": "0",
  "baseGas": "0",
  "gasPrice": "0",
  "gasToken": "0x0000000000000000000000000000000000000000",
  "refundReceiver": "0x0000000000000000000000000000000000000000",
  "signatures": "0x...",
  "inner_decoded": {
    "name": "transfer",
    "args": { "to": "0x...", "amount": "500000000" }
  }
}
```

`inner_decoded` is only present when `inner_abi` is provided and the selector matches.

---

## R — ABI Registry

### `abi_list`

List all built-in well-known ABIs available in the registry.

**Parameters:** None.

**Response shape:**

```json
[
  { "key": "erc20",           "name": "ERC-20",        "description": "Standard ERC-20 fungible token interface (EIP-20)" },
  { "key": "erc721",          "name": "ERC-721",        "description": "Standard ERC-721 non-fungible token interface (EIP-721)" },
  { "key": "erc1155",         "name": "ERC-1155",       "description": "Standard ERC-1155 multi-token interface (EIP-1155)" },
  { "key": "weth",            "name": "WETH9",          "description": "Wrapped Ether (WETH9) — deposit, withdraw, and ERC-20 interface" },
  { "key": "uniswap-v2-pair", "name": "Uniswap V2 Pair","description": "Uniswap V2 liquidity pair — getReserves, swap, mint, burn" },
  { "key": "uniswap-v3-pool", "name": "Uniswap V3 Pool","description": "Uniswap V3 pool — slot0, liquidity, swap" },
  { "key": "gnosis-safe",     "name": "Gnosis Safe",    "description": "Gnosis Safe multisig — execTransaction and core view functions" },
  { "key": "ownable",         "name": "Ownable",        "description": "OpenZeppelin Ownable — owner, transferOwnership, renounceOwnership" },
  { "key": "access-control",  "name": "AccessControl",  "description": "OpenZeppelin AccessControl — role management" },
  { "key": "erc4626",         "name": "ERC-4626",       "description": "Tokenised vault standard (EIP-4626)" }
]
```

---

### `abi_get`

Retrieve the full ABI array for a built-in contract. The returned `abi` array is ready to pass to `decode_error`, `decode_storage`, `safe_decode`, `watch_events`, or `get_events`.

**Parameters:**

| Name | Type | Required | Description |
|---|---|---|---|
| `key` | `string` | Yes | ABI key from `abi_list` (case-insensitive, e.g. `"erc20"`, `"uniswap-v2-pair"`) |

**Response shape:**

```json
{
  "name": "ERC-20",
  "description": "Standard ERC-20 fungible token interface (EIP-20)",
  "abi": [
    { "type": "function", "name": "transfer", "inputs": [...], "outputs": [...], "stateMutability": "nonpayable" },
    { "type": "event", "name": "Transfer", "inputs": [...] }
  ]
}
```

Returns a `NOT_FOUND` error if the key is not recognised.
