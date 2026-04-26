// Etherscan v2 uses a single base URL with chainid parameter.
// This map provides human-readable names for display purposes.
export const CHAIN_NAMES: Record<number, string> = {
  1:        "Ethereum Mainnet",
  5:        "Goerli Testnet",
  11155111: "Sepolia Testnet",
  17000:    "Holesky Testnet",
  56:       "BNB Smart Chain",
  97:       "BNB Testnet",
  137:      "Polygon",
  80001:    "Polygon Mumbai",
  80002:    "Polygon Amoy",
  42161:    "Arbitrum One",
  421614:   "Arbitrum Sepolia",
  10:       "Optimism",
  11155420: "Optimism Sepolia",
  8453:     "Base",
  84532:    "Base Sepolia",
  43114:    "Avalanche C-Chain",
  43113:    "Avalanche Fuji",
  250:      "Fantom Opera",
  25:       "Cronos",
  1284:     "Moonbeam",
  1285:     "Moonriver",
  100:      "Gnosis",
  1101:     "Polygon zkEVM",
  324:      "zkSync Era",
  59144:    "Linea",
  5000:     "Mantle",
  81457:    "Blast",
  534352:   "Scroll",
  169:      "Manta Pacific",
  7777777:  "Zora",
};

// All Etherscan v2 requests go to this single endpoint with &chainid=N
export const ETHERSCAN_V2_BASE = "https://api.etherscan.io/v2/api";
