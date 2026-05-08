const { ethers } = require("ethers")
const { parseAddress } = require("../../utils/addresses")

const trackedWalletsByChat = new Map()
const lastBalancesByAddress = new Map()
let isWatchingBlocks = false

function registerWalletTrackerCommand({ bot, provider }) {
  bot.onText(/\/trackwallet(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id
    const address = parseAddress(match[1])

    if (!address) {
      bot.sendMessage(chatId, "Usage: /trackwallet 0xWalletAddress")
      return
    }

    if (!trackedWalletsByChat.has(chatId)) {
      trackedWalletsByChat.set(chatId, new Set())
    }

    trackedWalletsByChat.get(chatId).add(address)
    lastBalancesByAddress.set(address, await provider.getBalance(address))
    startBlockWatcher({ bot, provider })

    bot.sendMessage(chatId, `Tracking wallet: ${address}`)
  })

  bot.onText(/\/trackedwallets/, (msg) => {
    const wallets = Array.from(trackedWalletsByChat.get(msg.chat.id) || [])

    bot.sendMessage(
      msg.chat.id,
      wallets.length ? wallets.join("\n") : "No wallets tracked yet."
    )
  })
}

function startBlockWatcher({ bot, provider }) {
  if (isWatchingBlocks) {
    return
  }

  isWatchingBlocks = true

  provider.on("block", async (blockNumber) => {
    const addresses = new Set()

    for (const wallets of trackedWalletsByChat.values()) {
      for (const address of wallets) {
        addresses.add(address)
      }
    }

    for (const address of addresses) {
      await notifyBalanceChange({ bot, provider, address, blockNumber })
    }
  })
}

async function notifyBalanceChange({ bot, provider, address, blockNumber }) {
  const previousBalance = lastBalancesByAddress.get(address)
  const currentBalance = await provider.getBalance(address)

  if (previousBalance === undefined || previousBalance === currentBalance) {
    lastBalancesByAddress.set(address, currentBalance)
    return
  }

  lastBalancesByAddress.set(address, currentBalance)

  for (const [chatId, wallets] of trackedWalletsByChat.entries()) {
    if (!wallets.has(address)) {
      continue
    }

    bot.sendMessage(
      chatId,
      [
        `Wallet balance changed at block ${blockNumber}`,
        address,
        `Before: ${ethers.formatEther(previousBalance)} ETH`,
        `After: ${ethers.formatEther(currentBalance)} ETH`,
      ].join("\n")
    )
  }
}

module.exports = {
  registerWalletTrackerCommand,
}

