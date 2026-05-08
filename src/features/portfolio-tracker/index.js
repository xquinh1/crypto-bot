const { ethers } = require("ethers")

function registerPortfolioTrackerCommand({ bot, provider, wallet }) {
  bot.onText(/\/portfolio/, async (msg) => {
    const balance = await provider.getBalance(wallet.address)
    const network = await provider.getNetwork()

    bot.sendMessage(
      msg.chat.id,
      [
        `Wallet: ${wallet.address}`,
        `Network: ${network.name} (${network.chainId})`,
        `Native balance: ${ethers.formatEther(balance)} ETH`,
      ].join("\n")
    )
  })
}

module.exports = {
  registerPortfolioTrackerCommand,
}

