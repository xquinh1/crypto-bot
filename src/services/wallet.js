const { ethers } = require("ethers")
const { getDefaultChain, getRequiredChainProvider } = require("./chains")

function createWalletContext() {
  if (!process.env.PRIVATE_KEY) {
    throw new Error("Missing PRIVATE_KEY in .env")
  }

  const chain = getDefaultChain()
  const provider = getRequiredChainProvider(chain)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider)

  return {
    chain,
    provider,
    wallet,
  }
}

module.exports = {
  createWalletContext,
}
