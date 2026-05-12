const { ethers } = require("ethers")
const { getChain, getSupportedChains } = require("../config/chains")

function getChainProvider(chain) {
  return getRequiredChainProvider(chain)
}

function getRequiredChainProvider(chain) {
  const rpcUrls = getChainRpcUrls(chain)

  if (!rpcUrls.length) {
    throw new Error(`Missing ${chain.rpcEnv} in .env`)
  }

  const providers = rpcUrls.map((rpcUrl) => new ethers.JsonRpcProvider(rpcUrl, undefined, {
    batchMaxCount: 1,
  }))

  if (providers.length === 1) {
    return providers[0]
  }

  return new ethers.FallbackProvider(
    providers.map((provider, index) => ({
      provider,
      priority: index + 1,
      stallTimeout: getRpcStallTimeoutMs(),
      weight: 1,
    })),
    undefined,
    {
      quorum: 1,
    }
  )
}

function getDefaultChain() {
  const defaultChainSlug = process.env.DEFAULT_CHAIN || "sepolia"
  const chain = getChain(defaultChainSlug)

  if (!chain) {
    throw new Error(`Unsupported DEFAULT_CHAIN: ${defaultChainSlug}`)
  }

  return chain
}

function getChainWallet(chain) {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("Missing PRIVATE_KEY in .env")
  }

  return new ethers.Wallet(process.env.PRIVATE_KEY, getChainProvider(chain))
}

async function getRequiredChainWallet(chain) {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("Missing PRIVATE_KEY in .env")
  }

  const provider = getRequiredChainProvider(chain)
  await assertExpectedChain({ provider, chain })

  return new ethers.Wallet(process.env.PRIVATE_KEY, provider)
}

async function assertExpectedChain({ provider, chain }) {
  const network = await provider.getNetwork()
  const actualChainId = Number(network.chainId)

  if (actualChainId !== chain.chainId) {
    throw new Error(
      `${chain.rpcEnv} points to chainId ${actualChainId}, expected ${chain.chainId} (${chain.name})`
    )
  }
}

function getChainRpcUrls(chain) {
  const urls = [
    ...parseRpcUrls(process.env[`${chain.rpcEnv}S`]),
    ...parseRpcUrls(process.env[chain.rpcEnv]),
    ...parseRpcUrls(process.env[chain.fallbackRpcEnv]),
  ]
  const seen = new Set()

  return urls.filter((url) => {
    if (seen.has(url)) {
      return false
    }

    seen.add(url)
    return true
  })
}

function parseRpcUrls(value) {
  return String(value || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
}

function getRpcStallTimeoutMs() {
  const timeoutMs = Number(process.env.RPC_STALL_TIMEOUT_MS || "1500")

  if (!Number.isFinite(timeoutMs) || timeoutMs < 250) {
    return 1500
  }

  return timeoutMs
}

function formatSupportedChains() {
  return Object.entries(getSupportedChains())
    .map(([slug, chain]) => `${slug} - ${chain.name}`)
    .join("\n")
}

module.exports = {
  formatSupportedChains,
  getDefaultChain,
  getRequiredChainProvider,
  getRequiredChainWallet,
  getChain,
  getChainProvider,
  getChainWallet,
  getChainRpcUrls,
}
