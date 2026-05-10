const CHAINS = {
  eth: {
    chainId: 1,
    name: "Ethereum",
    currency: "ETH",
    rpcEnv: "ETH_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://etherscan.io",
    wrappedNative: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    tokens: {
      USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      DAI: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      UNI: "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984",
      LINK: "0x514910771AF9Ca656af840dff83E8264EcF986CA",
    },
  },
  sepolia: {
    chainId: 11155111,
    name: "Sepolia",
    currency: "ETH",
    rpcEnv: "SEPOLIA_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://sepolia.etherscan.io",
    wrappedNative: "0x7b79995e5f793A07Bc00c21d5351294B43fE1e5",
    tokens: {
      WETH: "0x7b79995e5f793A07Bc00c21d5351294B43fE1e5",
    },
  },
  base: {
    chainId: 8453,
    name: "Base",
    currency: "ETH",
    rpcEnv: "BASE_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://basescan.org",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    tokens: {
      USDC: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      WETH: "0x4200000000000000000000000000000000000006",
      DAI: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb",
    },
  },
  arbitrum: {
    chainId: 42161,
    name: "Arbitrum One",
    currency: "ETH",
    rpcEnv: "ARBITRUM_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://arbiscan.io",
    wrappedNative: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    tokens: {
      WETH: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
    },
  },
  optimism: {
    chainId: 10,
    name: "Optimism",
    currency: "ETH",
    rpcEnv: "OPTIMISM_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://optimistic.etherscan.io",
    wrappedNative: "0x4200000000000000000000000000000000000006",
    tokens: {
      WETH: "0x4200000000000000000000000000000000000006",
    },
  },
  polygon: {
    chainId: 137,
    name: "Polygon",
    currency: "MATIC",
    rpcEnv: "POLYGON_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://polygonscan.com",
    wrappedNative: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    tokens: {
      USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
      USDC: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
      DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
      WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
      WMATIC: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    },
  },
  bsc: {
    chainId: 56,
    name: "BNB Smart Chain",
    currency: "BNB",
    rpcEnv: "BSC_RPC_URL",
    fallbackRpcEnv: "RPC_URL",
    explorerBaseUrl: "https://bscscan.com",
    wrappedNative: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    tokens: {
      USDT: "0x55d398326f99059fF775485246999027B3197955",
      USDC: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56",
      WBNB: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
      CAKE: "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82",
    },
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
