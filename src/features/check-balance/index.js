const { ethers } = require("ethers")
const { formatSupportedChains, getChain, getRequiredChainProvider } = require("../../services/chains")

function registerBalanceCommand({ bot, chain: defaultChain, wallet }) {
  bot.onText(/^\/balance(?:@\w+)?(?:\s+(\S+))?$/, async (msg, match) => {
    const chatId = msg.chat.id
    const chainSlug = match[1] || defaultChain.slug
    const chain = getChain(chainSlug)

    if (String(chainSlug).toLowerCase() === "all") {
      await sendAllBalances({ bot, chatId, walletAddress: wallet.address })
      return
    }

    if (!chain) {
      bot.sendMessage(chatId, `Unsupported chain: ${chainSlug}\n\n${formatSupportedChains()}`)
      return
    }

    try {
      const balance = await getChainBalance({ chain, walletAddress: wallet.address })

      bot.sendMessage(
        chatId,
        [
          `Chain: ${chain.name}`,
          `Wallet: ${wallet.address}`,
          `Balance: ${ethers.formatEther(balance)} ${chain.currency}`,
        ].join("\n")
      )
    } catch (error) {
      bot.sendMessage(chatId, `Balance check failed: ${error.message}`)
    }
  })
}

async function sendAllBalances({ bot, chatId, walletAddress }) {
  const lines = await Promise.all(
    formatSupportedChains()
      .split("\n")
      .map(async (line) => {
        const slug = line.split(" - ")[0]
        const chain = getChain(slug)

        try {
          const balance = await getChainBalance({ chain, walletAddress })
          return `${slug}: ${ethers.formatEther(balance)} ${chain.currency}`
        } catch (error) {
          return `${slug}: ${error.message}`
        }
      })
  )

  bot.sendMessage(chatId, [`Wallet: ${walletAddress}`, "", ...lines].join("\n"))
}

async function getChainBalance({ chain, walletAddress }) {
  const provider = getRequiredChainProvider(chain)
  const network = await provider.getNetwork()

  if (Number(network.chainId) !== chain.chainId) {
    throw new Error(`${chain.rpcEnv} points to chainId ${Number(network.chainId)}, expected ${chain.chainId}`)
  }

  return provider.getBalance(walletAddress)
}

module.exports = {
  registerBalanceCommand,
}
