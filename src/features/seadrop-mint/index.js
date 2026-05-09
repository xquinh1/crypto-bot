const { ethers } = require("ethers")
const { parseAddress } = require("../../utils/addresses")
const { formatSupportedChains, getChain, getRequiredChainWallet } = require("../../services/chains")
const { getAddressUrl, getTransactionUrl } = require("../../services/explorer")
const {
  DEFAULT_FEE_RECIPIENT,
  DEFAULT_SEADROP_ADDRESS,
  SEADROP_ABI,
  formatSeaDropSummary,
  formatSeaDropStatus,
  getSeaDropMintValue,
  getSeaDropSummary,
  sendSeaDropMint,
  simulateSeaDropMint,
  waitForSeaDropOpen,
} = require("../../services/seadrop-minter")

const pendingSeaDropsByChat = new Map()

function registerSeaDropMintCommand({ bot }) {
  bot.onText(/^\/seadrop(?:@\w+)?(?:\s+.+)?$/s, async (msg) => {
    const chatId = msg.chat.id
    const { chainSlug, nftContract, seaDropAddress, feeRecipient } = parseSeaDropCommand(msg.text)

    if (!chainSlug || !nftContract) {
      bot.sendMessage(chatId, buildSeaDropUsage())
      return
    }

    const chain = getChain(chainSlug)

    if (!chain) {
      bot.sendMessage(chatId, `Unsupported chain: ${chainSlug}\n\n${formatSupportedChains()}`)
      return
    }

    try {
      bot.sendMessage(chatId, `Fetching SeaDrop public drop for ${nftContract}...`)

      const wallet = await getRequiredChainWallet(chain)
      const seaDrop = new ethers.Contract(seaDropAddress, SEADROP_ABI, wallet)
      const summary = await getSeaDropSummary({ seaDrop, nftContract })

      pendingSeaDropsByChat.set(chatId, {
        chain,
        feeRecipient,
        nftContract,
        seaDropAddress,
        summary,
      })

      bot.sendMessage(
        chatId,
        buildSeaDropSummaryMessage({
          chain,
          feeRecipient,
          nftContract,
          seaDropAddress,
          summary,
        })
      )
    } catch (error) {
      bot.sendMessage(chatId, `SeaDrop setup failed: ${error.message}`)
    }
  })

  bot.onText(/^\/confirmseadrop(?:@\w+)?(?:\s+(\d+))?$/, async (msg, match) => {
    const chatId = msg.chat.id
    const quantity = Number(match[1])

    await confirmSeaDropMint({ bot, chatId, quantity })
  })
}

function parseSeaDropCommand(text) {
  const parts = String(text || "").trim().split(/\s+/)
  const addresses = parts.slice(2).map(parseAddress).filter(Boolean)

  return {
    chainSlug: parts[1],
    nftContract: addresses[0],
    seaDropAddress: addresses[1] || process.env.SEADROP_ADDRESS || DEFAULT_SEADROP_ADDRESS,
    feeRecipient: addresses[2] || process.env.SEADROP_FEE_RECIPIENT || DEFAULT_FEE_RECIPIENT,
  }
}

async function confirmSeaDropMint({ bot, chatId, quantity }) {
  const pendingSeaDrop = pendingSeaDropsByChat.get(chatId)

  if (!pendingSeaDrop) {
    bot.sendMessage(chatId, "No pending SeaDrop mint. Start with: /seadrop base 0xNFTContract")
    return
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    bot.sendMessage(chatId, "Usage: /confirmseadrop 1")
    return
  }

  try {
    const wallet = await getRequiredChainWallet(pendingSeaDrop.chain)
    const seaDrop = new ethers.Contract(pendingSeaDrop.seaDropAddress, SEADROP_ABI, wallet)
    let lastWaitNoticeAt = 0

    bot.sendMessage(chatId, "Checking SeaDrop open time...")

    const summary = await waitForSeaDropOpen({
      seaDrop,
      nftContract: pendingSeaDrop.nftContract,
      pollMs: getSeaDropPollMs(),
      onStatus: async ({ summary }) => {
        const now = Date.now()

        if (now - lastWaitNoticeAt < 60000) {
          return
        }

        lastWaitNoticeAt = now
        await bot.sendMessage(chatId, `SeaDrop not open yet. ${formatSeaDropStatus(summary)}`)
      },
    })

    if (!summary.isOpen) {
      bot.sendMessage(chatId, `SeaDrop is not open. ${formatSeaDropStatus(summary)}`)
      return
    }

    const value = getSeaDropMintValue({ summary, quantity })

    bot.sendMessage(chatId, "SeaDrop is open. Simulating mint...")

    await simulateSeaDropMint({
      seaDrop,
      nftContract: pendingSeaDrop.nftContract,
      feeRecipient: pendingSeaDrop.feeRecipient,
      walletAddress: wallet.address,
      quantity,
      value,
    })

    bot.sendMessage(chatId, "Simulation passed. Sending SeaDrop mint transaction...")

    const tx = await sendSeaDropMint({
      seaDrop,
      nftContract: pendingSeaDrop.nftContract,
      feeRecipient: pendingSeaDrop.feeRecipient,
      quantity,
      value,
    })

    pendingSeaDropsByChat.delete(chatId)

    bot.sendMessage(
      chatId,
      [
        "SeaDrop mint transaction sent.",
        `Hash: ${tx.hash}`,
        `Network: ${pendingSeaDrop.chain.name} (${pendingSeaDrop.chain.chainId})`,
        getTransactionUrl(pendingSeaDrop.chain, tx.hash),
      ].join("\n")
    )
  } catch (error) {
    bot.sendMessage(chatId, `SeaDrop mint failed: ${error.message}`)
  }
}

function buildSeaDropSummaryMessage({
  chain,
  feeRecipient,
  nftContract,
  seaDropAddress,
  summary,
}) {
  return [
    "SeaDrop public mint detected",
    `Chain: ${chain.name}`,
    `NFT: ${nftContract}`,
    getAddressUrl(chain, nftContract),
    `SeaDrop: ${seaDropAddress}`,
    getAddressUrl(chain, seaDropAddress),
    `Fee recipient: ${feeRecipient}`,
    "",
    formatSeaDropSummary(summary, chain.currency),
    "",
    "Confirm with: /confirmseadrop <quantity>",
  ].join("\n")
}

function buildSeaDropUsage() {
  return [
    "Usage: /seadrop base 0xNFTContract",
    "",
    "Optional:",
    "/seadrop base 0xNFTContract 0xSeaDropAddress 0xFeeRecipient",
    "",
    "Confirm with: /confirmseadrop 1",
  ].join("\n")
}

function getSeaDropPollMs() {
  const pollMs = Number(process.env.SEADROP_OPEN_POLL_MS || process.env.MINT_OPEN_POLL_MS || "5000")

  if (!Number.isFinite(pollMs) || pollMs < 1000) {
    return 5000
  }

  return pollMs
}

module.exports = {
  registerSeaDropMintCommand,
}
