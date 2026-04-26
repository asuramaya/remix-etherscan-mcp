export interface AbiEntry {
  name:        string;
  description: string;
  abi:         object[];
}

export const WELL_KNOWN_ABIS: Record<string, AbiEntry> = {

  "erc20": {
    name: "ERC-20",
    description: "Standard ERC-20 fungible token interface (EIP-20)",
    abi: [
      { type: "function", name: "name",        inputs: [],                                                                   outputs: [{ name: "", type: "string"  }], stateMutability: "view"        },
      { type: "function", name: "symbol",      inputs: [],                                                                   outputs: [{ name: "", type: "string"  }], stateMutability: "view"        },
      { type: "function", name: "decimals",    inputs: [],                                                                   outputs: [{ name: "", type: "uint8"   }], stateMutability: "view"        },
      { type: "function", name: "totalSupply", inputs: [],                                                                   outputs: [{ name: "", type: "uint256" }], stateMutability: "view"        },
      { type: "function", name: "balanceOf",   inputs: [{ name: "owner",   type: "address" }],                               outputs: [{ name: "", type: "uint256" }], stateMutability: "view"        },
      { type: "function", name: "allowance",   inputs: [{ name: "owner",   type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "transfer",    inputs: [{ name: "to",      type: "address" }, { name: "amount",  type: "uint256" }], outputs: [{ name: "", type: "bool"    }], stateMutability: "nonpayable" },
      { type: "function", name: "transferFrom",inputs: [{ name: "from",    type: "address" }, { name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
      { type: "function", name: "approve",     inputs: [{ name: "spender", type: "address" }, { name: "amount",  type: "uint256" }], outputs: [{ name: "", type: "bool"    }], stateMutability: "nonpayable" },
      { type: "event",    name: "Transfer",    inputs: [{ name: "from",    type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "Approval",    inputs: [{ name: "owner",   type: "address", indexed: true }, { name: "spender", type: "address", indexed: true }, { name: "value", type: "uint256", indexed: false }], anonymous: false },
    ],
  },

  "erc721": {
    name: "ERC-721",
    description: "Standard ERC-721 non-fungible token interface (EIP-721)",
    abi: [
      { type: "function", name: "name",                inputs: [],                                                                                                                   outputs: [{ name: "", type: "string"  }], stateMutability: "view" },
      { type: "function", name: "symbol",              inputs: [],                                                                                                                   outputs: [{ name: "", type: "string"  }], stateMutability: "view" },
      { type: "function", name: "tokenURI",            inputs: [{ name: "tokenId", type: "uint256" }],                                                                               outputs: [{ name: "", type: "string"  }], stateMutability: "view" },
      { type: "function", name: "totalSupply",         inputs: [],                                                                                                                   outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "balanceOf",           inputs: [{ name: "owner", type: "address" }],                                                                                 outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "ownerOf",             inputs: [{ name: "tokenId", type: "uint256" }],                                                                               outputs: [{ name: "", type: "address" }], stateMutability: "view" },
      { type: "function", name: "getApproved",         inputs: [{ name: "tokenId", type: "uint256" }],                                                                               outputs: [{ name: "", type: "address" }], stateMutability: "view" },
      { type: "function", name: "isApprovedForAll",    inputs: [{ name: "owner", type: "address" }, { name: "operator", type: "address" }],                                          outputs: [{ name: "", type: "bool"    }], stateMutability: "view" },
      { type: "function", name: "approve",             inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }],                                              outputs: [],                              stateMutability: "nonpayable" },
      { type: "function", name: "setApprovalForAll",   inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }],                                         outputs: [],                              stateMutability: "nonpayable" },
      { type: "function", name: "transferFrom",        inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }],          outputs: [],                              stateMutability: "nonpayable" },
      { type: "function", name: "safeTransferFrom",    inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "tokenId", type: "uint256" }],          outputs: [],                              stateMutability: "nonpayable" },
      { type: "event",    name: "Transfer",            inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "tokenId", type: "uint256", indexed: true }], anonymous: false },
      { type: "event",    name: "Approval",            inputs: [{ name: "owner", type: "address", indexed: true }, { name: "approved", type: "address", indexed: true }, { name: "tokenId", type: "uint256", indexed: true }], anonymous: false },
      { type: "event",    name: "ApprovalForAll",      inputs: [{ name: "owner", type: "address", indexed: true }, { name: "operator", type: "address", indexed: true }, { name: "approved", type: "bool", indexed: false }], anonymous: false },
    ],
  },

  "erc1155": {
    name: "ERC-1155",
    description: "Standard ERC-1155 multi-token interface (EIP-1155)",
    abi: [
      { type: "function", name: "balanceOf",         inputs: [{ name: "account", type: "address" }, { name: "id", type: "uint256" }],                                               outputs: [{ name: "", type: "uint256"   }], stateMutability: "view" },
      { type: "function", name: "balanceOfBatch",    inputs: [{ name: "accounts", type: "address[]" }, { name: "ids", type: "uint256[]" }],                                        outputs: [{ name: "", type: "uint256[]" }], stateMutability: "view" },
      { type: "function", name: "isApprovedForAll",  inputs: [{ name: "account", type: "address" }, { name: "operator", type: "address" }],                                         outputs: [{ name: "", type: "bool"      }], stateMutability: "view" },
      { type: "function", name: "setApprovalForAll", inputs: [{ name: "operator", type: "address" }, { name: "approved", type: "bool" }],                                           outputs: [],                               stateMutability: "nonpayable" },
      { type: "function", name: "safeTransferFrom",  inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "id", type: "uint256" }, { name: "amount", type: "uint256" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
      { type: "function", name: "safeBatchTransferFrom", inputs: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "ids", type: "uint256[]" }, { name: "amounts", type: "uint256[]" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
      { type: "event",    name: "TransferSingle",    inputs: [{ name: "operator", type: "address", indexed: true }, { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "id", type: "uint256", indexed: false }, { name: "value", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "TransferBatch",     inputs: [{ name: "operator", type: "address", indexed: true }, { name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "ids", type: "uint256[]", indexed: false }, { name: "values", type: "uint256[]", indexed: false }], anonymous: false },
      { type: "event",    name: "ApprovalForAll",    inputs: [{ name: "account", type: "address", indexed: true }, { name: "operator", type: "address", indexed: true }, { name: "approved", type: "bool", indexed: false }], anonymous: false },
    ],
  },

  "weth": {
    name: "WETH9",
    description: "Wrapped Ether (WETH9) — deposit, withdraw, and ERC-20 interface",
    abi: [
      { type: "function", name: "deposit",    inputs: [],                                                                          outputs: [],                              stateMutability: "payable"    },
      { type: "function", name: "withdraw",   inputs: [{ name: "wad", type: "uint256" }],                                          outputs: [],                              stateMutability: "nonpayable" },
      { type: "function", name: "name",       inputs: [],                                                                          outputs: [{ name: "", type: "string"  }], stateMutability: "view"       },
      { type: "function", name: "symbol",     inputs: [],                                                                          outputs: [{ name: "", type: "string"  }], stateMutability: "view"       },
      { type: "function", name: "decimals",   inputs: [],                                                                          outputs: [{ name: "", type: "uint8"   }], stateMutability: "view"       },
      { type: "function", name: "totalSupply",inputs: [],                                                                          outputs: [{ name: "", type: "uint256" }], stateMutability: "view"       },
      { type: "function", name: "balanceOf",  inputs: [{ name: "owner", type: "address" }],                                       outputs: [{ name: "", type: "uint256" }], stateMutability: "view"       },
      { type: "function", name: "allowance",  inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view"       },
      { type: "function", name: "transfer",   inputs: [{ name: "dst", type: "address" }, { name: "wad", type: "uint256" }],       outputs: [{ name: "", type: "bool"    }], stateMutability: "nonpayable" },
      { type: "function", name: "transferFrom",inputs: [{ name: "src", type: "address" }, { name: "dst", type: "address" }, { name: "wad", type: "uint256" }], outputs: [{ name: "", type: "bool" }], stateMutability: "nonpayable" },
      { type: "function", name: "approve",    inputs: [{ name: "guy", type: "address" }, { name: "wad", type: "uint256" }],       outputs: [{ name: "", type: "bool"    }], stateMutability: "nonpayable" },
      { type: "event",    name: "Deposit",    inputs: [{ name: "dst", type: "address", indexed: true }, { name: "wad", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "Withdrawal", inputs: [{ name: "src", type: "address", indexed: true }, { name: "wad", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "Transfer",   inputs: [{ name: "from", type: "address", indexed: true }, { name: "to", type: "address", indexed: true }, { name: "wad", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "Approval",   inputs: [{ name: "src", type: "address", indexed: true }, { name: "guy", type: "address", indexed: true }, { name: "wad", type: "uint256", indexed: false }], anonymous: false },
    ],
  },

  "uniswap-v2-pair": {
    name: "Uniswap V2 Pair",
    description: "Uniswap V2 liquidity pair — getReserves, swap, mint, burn",
    abi: [
      { type: "function", name: "getReserves",     inputs: [],                                                                                                              outputs: [{ name: "reserve0", type: "uint112" }, { name: "reserve1", type: "uint112" }, { name: "blockTimestampLast", type: "uint32" }], stateMutability: "view" },
      { type: "function", name: "token0",          inputs: [],                                                                                                              outputs: [{ name: "", type: "address" }], stateMutability: "view" },
      { type: "function", name: "token1",          inputs: [],                                                                                                              outputs: [{ name: "", type: "address" }], stateMutability: "view" },
      { type: "function", name: "totalSupply",     inputs: [],                                                                                                              outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "price0CumulativeLast", inputs: [],                                                                                                         outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "price1CumulativeLast", inputs: [],                                                                                                         outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "swap",            inputs: [{ name: "amount0Out", type: "uint256" }, { name: "amount1Out", type: "uint256" }, { name: "to", type: "address" }, { name: "data", type: "bytes" }], outputs: [], stateMutability: "nonpayable" },
      { type: "function", name: "mint",            inputs: [{ name: "to", type: "address" }],                                                                               outputs: [{ name: "liquidity", type: "uint256" }], stateMutability: "nonpayable" },
      { type: "function", name: "burn",            inputs: [{ name: "to", type: "address" }],                                                                               outputs: [{ name: "amount0", type: "uint256" }, { name: "amount1", type: "uint256" }], stateMutability: "nonpayable" },
      { type: "function", name: "sync",            inputs: [],                                                                                                              outputs: [], stateMutability: "nonpayable" },
      { type: "event",    name: "Swap",            inputs: [{ name: "sender", type: "address", indexed: true }, { name: "amount0In", type: "uint256", indexed: false }, { name: "amount1In", type: "uint256", indexed: false }, { name: "amount0Out", type: "uint256", indexed: false }, { name: "amount1Out", type: "uint256", indexed: false }, { name: "to", type: "address", indexed: true }], anonymous: false },
      { type: "event",    name: "Mint",            inputs: [{ name: "sender", type: "address", indexed: true }, { name: "amount0", type: "uint256", indexed: false }, { name: "amount1", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "Burn",            inputs: [{ name: "sender", type: "address", indexed: true }, { name: "amount0", type: "uint256", indexed: false }, { name: "amount1", type: "uint256", indexed: false }, { name: "to", type: "address", indexed: true }], anonymous: false },
      { type: "event",    name: "Sync",            inputs: [{ name: "reserve0", type: "uint112", indexed: false }, { name: "reserve1", type: "uint112", indexed: false }], anonymous: false },
    ],
  },

  "uniswap-v3-pool": {
    name: "Uniswap V3 Pool",
    description: "Uniswap V3 pool — slot0, liquidity, swap",
    abi: [
      { type: "function", name: "slot0",      inputs: [], outputs: [{ name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" }, { name: "observationIndex", type: "uint16" }, { name: "observationCardinality", type: "uint16" }, { name: "observationCardinalityNext", type: "uint16" }, { name: "feeProtocol", type: "uint8" }, { name: "unlocked", type: "bool" }], stateMutability: "view" },
      { type: "function", name: "liquidity",  inputs: [], outputs: [{ name: "", type: "uint128" }], stateMutability: "view" },
      { type: "function", name: "fee",        inputs: [], outputs: [{ name: "", type: "uint24"  }], stateMutability: "view" },
      { type: "function", name: "token0",     inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
      { type: "function", name: "token1",     inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
      { type: "function", name: "tickSpacing",inputs: [], outputs: [{ name: "", type: "int24"   }], stateMutability: "view" },
      { type: "function", name: "feeGrowthGlobal0X128", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "feeGrowthGlobal1X128", inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "event",    name: "Swap",       inputs: [{ name: "sender", type: "address", indexed: true }, { name: "recipient", type: "address", indexed: true }, { name: "amount0", type: "int256", indexed: false }, { name: "amount1", type: "int256", indexed: false }, { name: "sqrtPriceX96", type: "uint160", indexed: false }, { name: "liquidity", type: "uint128", indexed: false }, { name: "tick", type: "int24", indexed: false }], anonymous: false },
      { type: "event",    name: "Mint",       inputs: [{ name: "sender", type: "address", indexed: false }, { name: "owner", type: "address", indexed: true }, { name: "tickLower", type: "int24", indexed: true }, { name: "tickUpper", type: "int24", indexed: true }, { name: "amount", type: "uint128", indexed: false }, { name: "amount0", type: "uint256", indexed: false }, { name: "amount1", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "Burn",       inputs: [{ name: "owner", type: "address", indexed: true }, { name: "tickLower", type: "int24", indexed: true }, { name: "tickUpper", type: "int24", indexed: true }, { name: "amount", type: "uint128", indexed: false }, { name: "amount0", type: "uint256", indexed: false }, { name: "amount1", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "Collect",    inputs: [{ name: "owner", type: "address", indexed: true }, { name: "recipient", type: "address", indexed: false }, { name: "tickLower", type: "int24", indexed: true }, { name: "tickUpper", type: "int24", indexed: true }, { name: "amount0", type: "uint128", indexed: false }, { name: "amount1", type: "uint128", indexed: false }], anonymous: false },
    ],
  },

  "gnosis-safe": {
    name: "Gnosis Safe",
    description: "Gnosis Safe multisig — execTransaction and core view functions",
    abi: [
      { type: "function", name: "execTransaction",    inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "signatures", type: "bytes" }], outputs: [{ name: "success", type: "bool" }], stateMutability: "payable" },
      { type: "function", name: "getOwners",          inputs: [], outputs: [{ name: "", type: "address[]" }], stateMutability: "view" },
      { type: "function", name: "getThreshold",       inputs: [], outputs: [{ name: "", type: "uint256"   }], stateMutability: "view" },
      { type: "function", name: "nonce",              inputs: [], outputs: [{ name: "", type: "uint256"   }], stateMutability: "view" },
      { type: "function", name: "VERSION",            inputs: [], outputs: [{ name: "", type: "string"    }], stateMutability: "view" },
      { type: "function", name: "isOwner",            inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
      { type: "function", name: "getTransactionHash", inputs: [{ name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "data", type: "bytes" }, { name: "operation", type: "uint8" }, { name: "safeTxGas", type: "uint256" }, { name: "baseGas", type: "uint256" }, { name: "gasPrice", type: "uint256" }, { name: "gasToken", type: "address" }, { name: "refundReceiver", type: "address" }, { name: "_nonce", type: "uint256" }], outputs: [{ name: "", type: "bytes32" }], stateMutability: "view" },
      { type: "event",    name: "ExecutionSuccess",   inputs: [{ name: "txHash", type: "bytes32", indexed: false }, { name: "payment", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "ExecutionFailure",   inputs: [{ name: "txHash", type: "bytes32", indexed: false }, { name: "payment", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "AddedOwner",         inputs: [{ name: "owner", type: "address", indexed: true }], anonymous: false },
      { type: "event",    name: "RemovedOwner",       inputs: [{ name: "owner", type: "address", indexed: true }], anonymous: false },
      { type: "event",    name: "ChangedThreshold",   inputs: [{ name: "threshold", type: "uint256", indexed: false }], anonymous: false },
    ],
  },

  "ownable": {
    name: "Ownable",
    description: "OpenZeppelin Ownable — owner, transferOwnership, renounceOwnership",
    abi: [
      { type: "function", name: "owner",              inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
      { type: "function", name: "transferOwnership",  inputs: [{ name: "newOwner", type: "address" }], outputs: [], stateMutability: "nonpayable" },
      { type: "function", name: "renounceOwnership",  inputs: [], outputs: [], stateMutability: "nonpayable" },
      { type: "event",    name: "OwnershipTransferred", inputs: [{ name: "previousOwner", type: "address", indexed: true }, { name: "newOwner", type: "address", indexed: true }], anonymous: false },
    ],
  },

  "access-control": {
    name: "AccessControl",
    description: "OpenZeppelin AccessControl — role management",
    abi: [
      { type: "function", name: "hasRole",          inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [{ name: "", type: "bool" }], stateMutability: "view" },
      { type: "function", name: "getRoleAdmin",     inputs: [{ name: "role", type: "bytes32" }],                                      outputs: [{ name: "", type: "bytes32" }], stateMutability: "view" },
      { type: "function", name: "grantRole",        inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [], stateMutability: "nonpayable" },
      { type: "function", name: "revokeRole",       inputs: [{ name: "role", type: "bytes32" }, { name: "account", type: "address" }], outputs: [], stateMutability: "nonpayable" },
      { type: "function", name: "renounceRole",     inputs: [{ name: "role", type: "bytes32" }, { name: "callerConfirmation", type: "address" }], outputs: [], stateMutability: "nonpayable" },
      { type: "event",    name: "RoleGranted",      inputs: [{ name: "role", type: "bytes32", indexed: true }, { name: "account", type: "address", indexed: true }, { name: "sender", type: "address", indexed: true }], anonymous: false },
      { type: "event",    name: "RoleRevoked",      inputs: [{ name: "role", type: "bytes32", indexed: true }, { name: "account", type: "address", indexed: true }, { name: "sender", type: "address", indexed: true }], anonymous: false },
      { type: "event",    name: "RoleAdminChanged", inputs: [{ name: "role", type: "bytes32", indexed: true }, { name: "previousAdminRole", type: "bytes32", indexed: true }, { name: "newAdminRole", type: "bytes32", indexed: true }], anonymous: false },
    ],
  },

  "erc4626": {
    name: "ERC-4626",
    description: "Tokenised vault standard (EIP-4626)",
    abi: [
      { type: "function", name: "asset",             inputs: [], outputs: [{ name: "", type: "address" }], stateMutability: "view" },
      { type: "function", name: "totalAssets",       inputs: [], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "convertToShares",   inputs: [{ name: "assets", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "convertToAssets",   inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "maxDeposit",        inputs: [{ name: "receiver", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "previewDeposit",    inputs: [{ name: "assets", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "deposit",           inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [{ name: "shares", type: "uint256" }], stateMutability: "nonpayable" },
      { type: "function", name: "maxMint",           inputs: [{ name: "receiver", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "previewMint",       inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "mint",              inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }], outputs: [{ name: "assets", type: "uint256" }], stateMutability: "nonpayable" },
      { type: "function", name: "maxWithdraw",       inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "previewWithdraw",   inputs: [{ name: "assets", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "withdraw",          inputs: [{ name: "assets", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }], outputs: [{ name: "shares", type: "uint256" }], stateMutability: "nonpayable" },
      { type: "function", name: "maxRedeem",         inputs: [{ name: "owner", type: "address" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "previewRedeem",     inputs: [{ name: "shares", type: "uint256" }], outputs: [{ name: "", type: "uint256" }], stateMutability: "view" },
      { type: "function", name: "redeem",            inputs: [{ name: "shares", type: "uint256" }, { name: "receiver", type: "address" }, { name: "owner", type: "address" }], outputs: [{ name: "assets", type: "uint256" }], stateMutability: "nonpayable" },
      { type: "event",    name: "Deposit",           inputs: [{ name: "sender", type: "address", indexed: true }, { name: "owner", type: "address", indexed: true }, { name: "assets", type: "uint256", indexed: false }, { name: "shares", type: "uint256", indexed: false }], anonymous: false },
      { type: "event",    name: "Withdraw",          inputs: [{ name: "sender", type: "address", indexed: true }, { name: "receiver", type: "address", indexed: true }, { name: "owner", type: "address", indexed: true }, { name: "assets", type: "uint256", indexed: false }, { name: "shares", type: "uint256", indexed: false }], anonymous: false },
    ],
  },
};

export function listAbis(): Array<{ key: string; name: string; description: string }> {
  return Object.entries(WELL_KNOWN_ABIS).map(([key, entry]) => ({
    key,
    name:        entry.name,
    description: entry.description,
  }));
}

export function getAbi(key: string): AbiEntry | undefined {
  return WELL_KNOWN_ABIS[key.toLowerCase()];
}
