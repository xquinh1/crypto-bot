const { ethers } = require("ethers")
const { formatSupportedChains, getChain, getDefaultChain, getRequiredChainProvider } = require("../utils/chainConfig")

async function checkBalance({ chainSlug, address, wallet }) {
  const requestedChain = chainSlug || getDefaultChain().slug

  if (String(requestedChain).toLowerCase() === "all") {
    return checkAllBalances({ address: address || wallet.address })
  }

  const chain = getChain(requestedChain)

  if (!chain) {
    throw new Error(`Unsupported chain: ${requestedChain}\n\n${formatSupportedChains()}`)
  }

  const targetAddress = address || wallet.address
  const provider = getRequiredChainProvider(chain)
  const balance = await provider.getBalance(targetAddress)

  return {
    action: "balance",
    chain,
    address: targetAddress,
    balance,
    text: [
      `Chain: ${chain.name}`,
      `Wallet: ${targetAddress}`,
      `Balance: ${ethers.formatEther(balance)} ${chain.currency}`,
    ].join("\n"),
  }
}

async function checkAllBalances({ address }) {
  const lines = await Promise.all(
    formatSupportedChains()
      .split("\n")
      .map(async (line) => {
        const slug = line.split(" - ")[0]
        const chain = getChain(slug)

        try {
          const provider = getRequiredChainProvider(chain)
          const balance = await provider.getBalance(address)
          return `${slug}: ${ethers.formatEther(balance)} ${chain.currency}`
        } catch (error) {
          return `${slug}: ${error.message}`
        }
      })
  )

  return {
    action: "balance",
    chain: "all",
    address,
    text: [`Wallet: ${address}`, "", ...lines].join("\n"),
  }
}

module.exports = {
  checkBalance,
}
