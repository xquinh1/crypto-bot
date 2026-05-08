const { ethers } = require("ethers")

function registerBalanceCommand({ bot, provider, wallet }) {
  bot.onText(/\/balance/, async (msg) => {
    const balance = await provider.getBalance(wallet.address)

    bot.sendMessage(
      msg.chat.id,
      `${ethers.formatEther(balance)} ETH`
    )
  })
}

module.exports = {
  registerBalanceCommand,
}

