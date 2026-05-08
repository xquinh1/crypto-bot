const CHAINS = {
  eth: {
    chainId: 1,
    name: "Ethereum",
    currency: "ETH",
    rpcEnv: "ETH_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://etherscan.io",
  },
  sepolia: {
    chainId: 11155111,
    name: "Sepolia",
    currency: "ETH",
    rpcEnv: "SEPOLIA_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://sepolia.etherscan.io",
  },
  base: {
    chainId: 8453,
    name: "Base",
    currency: "ETH",
    rpcEnv: "BASE_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://basescan.org",
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum One",
    currency: "ETH",
    rpcEnv: "ARBITRUM_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://arbiscan.io",
  },
  optimism: {
    chainId: 10,
    name: "Optimism",
    currency: "ETH",
    rpcEnv: "OPTIMISM_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://optimistic.etherscan.io",
  },
  polygon: {
    chainId: 137,
    name: "Polygon",
    currency: "MATIC",
    rpcEnv: "POLYGON_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://polygonscan.com",
  },
  bsc: {
    chainId: 56,
    name: "BNB Smart Chain",
    currency: "BNB",
    rpcEnv: "BSC_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://bscscan.com",
  },
}

function getSupportedChains() {
  return CHAINS
}

function getChain(slug) {
  const normalizedSlug = String(slug || "").toLowerCase()
  const chain = CHAINS[normalizedSlug]

  if (!chain) {
    return null
  }

  return {
    slug: normalizedSlug,
    ...chain,
  }
}

module.exports = {
  getChain,
  getSupportedChains,
}
