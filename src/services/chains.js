const { ethers } = require("ethers")
const { getChain, getSupportedChains } = require("../config/chains")

function getChainProvider(chain) {
  return getRequiredChainProvider(chain)
}

function getRequiredChainProvider(chain) {
  const rpcUrl = process.env[chain.rpcEnv]

  if (!rpcUrl) {
    throw new Error(`Missing ${chain.rpcEnv} in .env`)
  }

  return new ethers.JsonRpcProvider(rpcUrl, undefined, {
    batchMaxCount: 1,
  })
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
}
