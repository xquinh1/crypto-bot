const { ethers } = require("ethers")
const { parseAddress } = require("../../utils/addresses")
const { formatSupportedChains, getChain, getRequiredChainWallet } = require("../../services/chains")
const { fetchContractAbi, getAddressUrl, getTransactionUrl } = require("../../services/explorer")
const { confirmMintKeyboard } = require("../../utils/telegram-ui")
const {
  detectMintFunctions,
  formatCount,
  formatMintOpenStatus,
  formatValue,
  getMintSummary,
  getMintValue,
  sendMintTransaction,
  simulateMint,
  waitForMintOpen,
} = require("../../services/nft-minter")
const {
  DEFAULT_FEE_RECIPIENT,
  DEFAULT_SEADROP_ADDRESS,
  SEADROP_ABI,
  formatSeaDropSummary,
  formatSeaDropStatus,
  getSeaDropErrorMessage,
  getSeaDropMintValue,
  getSeaDropSummary,
  sendSeaDropMint,
  simulateSeaDropMint,
  validateSeaDropMintQuantity,
  waitForSeaDropOpen,
} = require("../../services/seadrop-minter")

const pendingMintsByChat = new Map()
const GAS_USAGE = [
  "Gas usage:",
  "/mint base 0xContractAddress <maxFeeGwei> <priorityFeeGwei>",
  "/mintgas <maxFeeGwei> <priorityFeeGwei>",
  "/mintgas gasPrice <gasPriceGwei>",
  "",
  "Examples:",
  "/mint base 0x1234567890abcdef1234567890abcdef12345678 30 2",
  "/mintgas 50 3",
  "/mintgas gasPrice 5",
].join("\n")

function registerMintNftCommand({ bot }) {
  bot.onText(/^\/mintchains(?:@\w+)?$/, (msg) => {
    bot.sendMessage(msg.chat.id, `Supported chains:\n${formatSupportedChains()}`)
  })

  bot.onText(/^\/mint(?:@\w+)?(?:\s+.+)?$/s, async (msg) => {
    const chatId = msg.chat.id
    const { chainSlug, contractAddress, gasSettings, gasError } = parseMintCommand(msg.text)

    if (!chainSlug || !contractAddress) {
      bot.sendMessage(
        chatId,
        [
          "Usage: /mint base 0xContractAddress",
          "",
          "Examples:",
          "/mint sepolia 0x1234567890abcdef1234567890abcdef12345678",
          "/mint base https://basescan.org/address/0x1234567890abcdef1234567890abcdef12345678",
        ].join("\n")
      )
      return
    }

    if (gasError) {
      bot.sendMessage(chatId, gasError)
      return
    }

    const chain = getChain(chainSlug)

    if (!chain) {
      bot.sendMessage(chatId, `Unsupported chain: ${chainSlug}\n\n${formatSupportedChains()}`)
      return
    }

    try {
      bot.sendMessage(chatId, `Fetching ABI from explorer for ${contractAddress}...`)

      const wallet = await getRequiredChainWallet(chain)
      const feeData = await wallet.provider.getFeeData()
      const abi = await fetchContractAbi({ chain, address: contractAddress })
      const contract = new ethers.Contract(contractAddress, abi, wallet)
      const mintFunctions = detectMintFunctions(abi)

      if (!mintFunctions.length) {
        const seaDropPendingMint = await buildSeaDropPendingMint({
          chain,
          contractAddress,
          feeData,
          gasSettings,
          wallet,
        })

        pendingMintsByChat.set(chatId, seaDropPendingMint)

        bot.sendMessage(
          chatId,
          buildSeaDropMintSummaryMessage(seaDropPendingMint),
          confirmMintKeyboard({ functionCount: 1 })
        )
        return
      }

      const summary = await getMintSummary({ abi, contract, mintFunctions })

      pendingMintsByChat.set(chatId, {
        type: "direct",
        chain,
        contractAddress,
        feeData,
        gasSettings,
        summary,
      })

      bot.sendMessage(
        chatId,
        buildMintSummaryMessage({ chain, contractAddress, feeData, gasSettings, summary }),
        confirmMintKeyboard({ functionCount: summary.mintFunctions.length })
      )
    } catch (error) {
      bot.sendMessage(chatId, `Mint setup failed: ${error.message}`)
    }
  })

  bot.onText(/^\/mintgas(?:@\w+)?(?:\s+(.+))?$/s, (msg, match) => {
    const chatId = msg.chat.id
    const pendingMint = pendingMintsByChat.get(chatId)

    if (!pendingMint) {
      bot.sendMessage(chatId, "No pending mint. Start with: /mint base 0xContractAddress")
      return
    }

    const { gasSettings, gasError } = parseGasSettings(String(match[1] || "").trim().split(/\s+/).filter(Boolean))

    if (gasError || !gasSettings) {
      bot.sendMessage(chatId, gasError || GAS_USAGE)
      return
    }

    pendingMint.gasSettings = gasSettings
    pendingMintsByChat.set(chatId, pendingMint)
    bot.sendMessage(chatId, `Mint gas updated: ${formatGasSettings(gasSettings)}`)
  })

  bot.onText(/\/confirmmint(?:\s+(\d+)(?:\s+(\d+))?)?/, async (msg, match) => {
    const chatId = msg.chat.id
    const quantity = Number(match[1])
    const functionNumber = Number(match[2] || "1")

    await confirmMint({ bot, chatId, quantity, functionNumber })
  })

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id
    const data = query.data || ""

    if (!data.startsWith("confirmmint:") && !data.startsWith("mint_fn_help:")) {
      return
    }

    await bot.answerCallbackQuery(query.id)

    if (data.startsWith("mint_fn_help:")) {
      const functionNumber = Number(data.split(":")[1])
      const pendingMint = pendingMintsByChat.get(chatId)

      if (!pendingMint) {
        bot.sendMessage(chatId, "No pending mint. Start with: /mint base 0xContractAddress")
        return
      }

      bot.sendMessage(chatId, `Use this function with: /confirmmint 1 ${functionNumber}`)
      return
    }

    const parts = data.split(":")
    const quantity = Number(parts[1])
    const functionNumber = Number(parts[2])

    await confirmMint({ bot, chatId, quantity, functionNumber })
  })
}

function parseMintCommand(text) {
  const parts = String(text || "").trim().split(/\s+/)
  const contractIndex = parts.findIndex((part, index) => index >= 2 && parseAddress(part))
  const gasParts = contractIndex >= 0 ? parts.slice(contractIndex + 1) : []
  const { gasSettings, gasError } = parseGasSettings(gasParts)

  return {
    chainSlug: parts[1],
    contractAddress: parseAddress(parts.slice(2).join(" ")),
    gasSettings,
    gasError,
  }
}

async function confirmMint({ bot, chatId, quantity, functionNumber }) {
  const pendingMint = pendingMintsByChat.get(chatId)

  if (!pendingMint) {
    bot.sendMessage(chatId, "No pending mint. Start with: /mint base 0xContractAddress")
    return
  }

  if (!Number.isInteger(quantity) || quantity <= 0) {
    bot.sendMessage(chatId, "Usage: /confirmmint 1")
    return
  }

  if (pendingMint.type === "seadrop") {
    await confirmSeaDropMint({ bot, chatId, pendingMint, quantity })
    return
  }

  const mintFunction = pendingMint.summary.mintFunctions[functionNumber - 1]

  if (!mintFunction) {
    bot.sendMessage(chatId, `Invalid mint function number. Choose 1-${pendingMint.summary.mintFunctions.length}.`)
    return
  }

  try {
    const wallet = await getRequiredChainWallet(pendingMint.chain)
    const contract = new ethers.Contract(
      pendingMint.contractAddress,
      pendingMint.summary.abi,
      wallet
    )
    const value = getMintValue({
      mintFunction,
      price: pendingMint.summary.price,
      quantity,
    })
    let lastWaitNoticeAt = 0

    bot.sendMessage(chatId, "Checking mint open time...")

    const mintOpenStatus = await waitForMintOpen({
      contract,
      pollMs: getMintOpenPollMs(),
      onStatus: async ({ status }) => {
        const now = Date.now()

        if (now - lastWaitNoticeAt < 60000) {
          return
        }

        lastWaitNoticeAt = now
        await bot.sendMessage(chatId, `Mint not open yet. ${formatMintOpenStatus(status)}`)
      },
    })

    if (!mintOpenStatus.isOpen) {
      bot.sendMessage(chatId, `Mint is not open and no waitable start time was detected. ${formatMintOpenStatus(mintOpenStatus)}`)
      return
    }

    const latestFeeData = await wallet.provider.getFeeData()
    const gasWarning = buildGasWarning({
      feeData: latestFeeData,
      gasSettings: pendingMint.gasSettings,
    })

    if (gasWarning) {
      bot.sendMessage(chatId, gasWarning)
    }

    bot.sendMessage(chatId, `Mint is open. Simulating mint transaction...`)

    await simulateMint({
      contract,
      mintFunction,
      walletAddress: wallet.address,
      quantity,
      value,
    })

    bot.sendMessage(chatId, "Simulation passed. Sending transaction...")

    const tx = await sendMintTransaction({
      contract,
      mintFunction,
      walletAddress: wallet.address,
      quantity,
      value,
      gasSettings: pendingMint.gasSettings,
    })

    pendingMintsByChat.delete(chatId)

    bot.sendMessage(
      chatId,
      [
        "Mint transaction sent.",
        `Hash: ${tx.hash}`,
        `Network: ${pendingMint.chain.name} (${pendingMint.chain.chainId})`,
        `Gas: ${formatGasSettings(pendingMint.gasSettings)}`,
        getTransactionUrl(pendingMint.chain, tx.hash),
      ].join("\n")
    )
  } catch (error) {
    bot.sendMessage(chatId, `Mint failed: ${error.message}`)
  }
}

async function buildSeaDropPendingMint({
  chain,
  contractAddress,
  feeData,
  gasSettings,
  wallet,
}) {
  const seaDropAddress = process.env.SEADROP_ADDRESS || DEFAULT_SEADROP_ADDRESS
  const feeRecipient = process.env.SEADROP_FEE_RECIPIENT || DEFAULT_FEE_RECIPIENT
  const seaDrop = new ethers.Contract(seaDropAddress, SEADROP_ABI, wallet)
  const summary = await getSeaDropSummary({
    seaDrop,
    nftContract: contractAddress,
  })

  return {
    type: "seadrop",
    chain,
    contractAddress,
    feeData,
    feeRecipient,
    gasSettings,
    seaDropAddress,
    summary,
  }
}

async function confirmSeaDropMint({ bot, chatId, pendingMint, quantity }) {
  try {
    const wallet = await getRequiredChainWallet(pendingMint.chain)
    const seaDrop = new ethers.Contract(pendingMint.seaDropAddress, SEADROP_ABI, wallet)
    let lastWaitNoticeAt = 0

    bot.sendMessage(chatId, "Checking SeaDrop open time...")

    const summary = await waitForSeaDropOpen({
      seaDrop,
      nftContract: pendingMint.contractAddress,
      pollMs: getMintOpenPollMs(),
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

    const latestFeeData = await wallet.provider.getFeeData()
    const gasWarning = buildGasWarning({
      feeData: latestFeeData,
      gasSettings: pendingMint.gasSettings,
    })

    if (gasWarning) {
      bot.sendMessage(chatId, gasWarning)
    }

    await validateSeaDropMintQuantity({
      seaDrop,
      nftContract: pendingMint.contractAddress,
      summary,
      walletAddress: wallet.address,
      quantity,
    })

    const value = getSeaDropMintValue({ summary, quantity })

    bot.sendMessage(chatId, "SeaDrop is open. Simulating mint...")

    await simulateSeaDropMint({
      seaDrop,
      nftContract: pendingMint.contractAddress,
      feeRecipient: pendingMint.feeRecipient,
      walletAddress: wallet.address,
      quantity,
      value,
    })

    bot.sendMessage(chatId, "Simulation passed. Sending SeaDrop mint transaction...")

    const tx = await sendSeaDropMint({
      seaDrop,
      nftContract: pendingMint.contractAddress,
      feeRecipient: pendingMint.feeRecipient,
      quantity,
      value,
      gasSettings: pendingMint.gasSettings,
    })

    pendingMintsByChat.delete(chatId)

    bot.sendMessage(
      chatId,
      [
        "SeaDrop mint transaction sent.",
        `Hash: ${tx.hash}`,
        `Network: ${pendingMint.chain.name} (${pendingMint.chain.chainId})`,
        `Gas: ${formatGasSettings(pendingMint.gasSettings)}`,
        getTransactionUrl(pendingMint.chain, tx.hash),
      ].join("\n")
    )
  } catch (error) {
    bot.sendMessage(chatId, `SeaDrop mint failed: ${getSeaDropErrorMessage(error)}`)
  }
}

function buildMintSummaryMessage({ chain, contractAddress, feeData, gasSettings, summary }) {
  const functions = summary.mintFunctions
    .map((mintFunction, index) => {
      const payableLabel = mintFunction.payable ? "payable" : "free/nonpayable"
      return `${index + 1}. ${mintFunction.signature} - ${payableLabel}`
    })
    .join("\n")

  return [
    "Mint contract detected",
    `Chain: ${chain.name}`,
    `Contract: ${contractAddress}`,
    getAddressUrl(chain, contractAddress),
    "",
    "Mint functions:",
    functions,
    "",
    `Mint price: ${formatValue(summary.price, chain.currency)}`,
    `Max mint: ${formatCount(summary.maxMint)}`,
    `Total supply: ${formatCount(summary.totalSupply)}`,
    `Max supply: ${formatCount(summary.maxSupply)}`,
    `Mint status: ${formatMintOpenStatus(summary.mintOpenStatus)}`,
    `Network gas now: ${formatFeeData(feeData)}`,
    `Gas: ${formatGasSettings(gasSettings)}`,
    "",
    "Set gas with: /mintgas <maxFeeGwei> <priorityFeeGwei>",
    "Confirm with: /confirmmint <quantity>",
    "Use another function with: /confirmmint <quantity> <functionNumber>",
  ].join("\n")
}

function buildSeaDropMintSummaryMessage(pendingMint) {
  return [
    "SeaDrop mint detected",
    `Chain: ${pendingMint.chain.name}`,
    `Contract: ${pendingMint.contractAddress}`,
    getAddressUrl(pendingMint.chain, pendingMint.contractAddress),
    `SeaDrop: ${pendingMint.seaDropAddress}`,
    `Fee recipient: ${pendingMint.feeRecipient}`,
    "",
    formatSeaDropSummary(pendingMint.summary, pendingMint.chain.currency),
    `Network gas now: ${formatFeeData(pendingMint.feeData)}`,
    `Gas: ${formatGasSettings(pendingMint.gasSettings)}`,
    "",
    "Set gas with: /mintgas <maxFeeGwei> <priorityFeeGwei>",
    "Confirm with: /confirmmint <quantity>",
  ].join("\n")
}

function parseGasSettings(parts) {
  if (!parts.length) {
    return {
      gasSettings: null,
      gasError: null,
    }
  }

  if (parts[0].toLowerCase() === "gasprice") {
    const gasPrice = parseGwei(parts[1])

    if (!gasPrice || parts.length !== 2) {
      return {
        gasSettings: null,
        gasError: GAS_USAGE,
      }
    }

    return {
      gasSettings: {
        type: "legacy",
        gasPrice,
      },
      gasError: null,
    }
  }

  const maxFeePerGas = parseGwei(parts[0])
  const maxPriorityFeePerGas = parseGwei(parts[1])

  if (!maxFeePerGas || !maxPriorityFeePerGas || parts.length !== 2) {
    return {
      gasSettings: null,
      gasError: GAS_USAGE,
    }
  }

  if (maxPriorityFeePerGas > maxFeePerGas) {
    return {
      gasSettings: null,
      gasError: "priorityFeeGwei must be less than or equal to maxFeeGwei.",
    }
  }

  return {
    gasSettings: {
      type: "eip1559",
      maxFeePerGas,
      maxPriorityFeePerGas,
    },
    gasError: null,
  }
}

function parseGwei(value) {
  if (!/^\d+(\.\d+)?$/.test(String(value || ""))) {
    return null
  }

  try {
    return ethers.parseUnits(value, "gwei")
  } catch (error) {
    return null
  }
}

function formatGasSettings(gasSettings) {
  if (!gasSettings) {
    return "auto network fee"
  }

  if (gasSettings.type === "legacy") {
    return `${ethers.formatUnits(gasSettings.gasPrice, "gwei")} gwei gasPrice`
  }

  return [
    `${ethers.formatUnits(gasSettings.maxFeePerGas, "gwei")} gwei maxFee`,
    `${ethers.formatUnits(gasSettings.maxPriorityFeePerGas, "gwei")} gwei priority`,
  ].join(", ")
}

function formatFeeData(feeData) {
  if (!feeData) {
    return "unknown"
  }

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    return [
      `${ethers.formatUnits(feeData.maxFeePerGas, "gwei")} gwei maxFee`,
      `${ethers.formatUnits(feeData.maxPriorityFeePerGas, "gwei")} gwei priority`,
    ].join(", ")
  }

  if (feeData.gasPrice) {
    return `${ethers.formatUnits(feeData.gasPrice, "gwei")} gwei gasPrice`
  }

  return "unknown"
}

function buildGasWarning({ feeData, gasSettings }) {
  if (!gasSettings || !feeData) {
    return null
  }

  if (gasSettings.type === "legacy" && feeData.gasPrice && gasSettings.gasPrice < feeData.gasPrice) {
    return [
      "Gas warning: your gasPrice is below the provider's current estimate.",
      `Your gas: ${formatGasSettings(gasSettings)}`,
      `Network gas now: ${formatFeeData(feeData)}`,
      "The tx can stay pending and miss the mint if demand spikes.",
    ].join("\n")
  }

  if (gasSettings.type === "eip1559" && feeData.maxFeePerGas && gasSettings.maxFeePerGas < feeData.maxFeePerGas) {
    return [
      "Gas warning: your maxFee is below the provider's current estimate.",
      `Your gas: ${formatGasSettings(gasSettings)}`,
      `Network gas now: ${formatFeeData(feeData)}`,
      "The tx can stay pending and miss the mint if demand spikes.",
    ].join("\n")
  }

  return null
}

function getMintOpenPollMs() {
  const pollMs = Number(process.env.MINT_OPEN_POLL_MS || "5000")

  if (!Number.isFinite(pollMs) || pollMs < 1000) {
    return 5000
  }

  return pollMs
}

module.exports = {
  registerMintNftCommand,
}
