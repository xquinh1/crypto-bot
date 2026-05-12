const { ethers } = require("ethers")

const DEFAULT_SEADROP_ADDRESS = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5"
const DEFAULT_FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719"
const SEADROP_ABI = [
  "error FeeRecipientNotAllowed(address feeRecipient)",
  "error IncorrectPayment(uint256 got,uint256 want)",
  "error MintQuantityCannotBeZero()",
  "error MintQuantityExceedsMaxMintedPerWallet(uint256 total,uint256 allowed)",
  "error MintQuantityExceedsMaxSupply(uint256 total,uint256 maxSupply)",
  "error MintQuantityExceedsMaxTokenSupplyForStage(uint256 total,uint256 maxTokenSupplyForStage)",
  "error NotActive(uint256 currentTimestamp,uint256 startTimestamp,uint256 endTimestamp)",
  "error PayerNotAllowed(address payer)",
  "function getPublicDrop(address nftContract) view returns ((uint80 mintPrice,uint48 startTime,uint48 endTime,uint16 maxTotalMintableByWallet,uint16 feeBps,bool restrictFeeRecipients))",
  "function mintPublic(address nftContract,address feeRecipient,address minterIfNotPayer,uint256 quantity) payable",
]
const SEADROP_TOKEN_ABI = [
  "function getMintStats(address minter) view returns (uint256 minterNumMinted,uint256 currentTotalSupply,uint256 maxSupply)",
]
const SEADROP_INTERFACE = new ethers.Interface(SEADROP_ABI)

async function getSeaDropSummary({ seaDrop, nftContract }) {
  const publicDrop = await seaDrop.getPublicDrop(nftContract)
  const block = await seaDrop.runner.provider.getBlock("latest")
  const now = BigInt(block.timestamp)
  const startTime = BigInt(publicDrop.startTime)
  const endTime = BigInt(publicDrop.endTime)

  return {
    mintPrice: BigInt(publicDrop.mintPrice),
    startTime,
    endTime,
    maxTotalMintableByWallet: BigInt(publicDrop.maxTotalMintableByWallet),
    feeBps: BigInt(publicDrop.feeBps),
    restrictFeeRecipients: publicDrop.restrictFeeRecipients,
    blockTimestamp: now,
    isOpen: isPublicDropOpen({ startTime, endTime, now }),
  }
}

async function waitForSeaDropOpen({ seaDrop, nftContract, pollMs = 5000, onStatus }) {
  let summary = await getSeaDropSummary({ seaDrop, nftContract })

  while (!summary.isOpen && summary.startTime > summary.blockTimestamp) {
    if (onStatus) {
      await onStatus({ summary })
    }

    const waitMs = Math.min(Number(summary.startTime - summary.blockTimestamp) * 1000, pollMs)
    await delay(Math.max(waitMs, 1000))
    summary = await getSeaDropSummary({ seaDrop, nftContract })
  }

  return summary
}

async function simulateSeaDropMint({
  seaDrop,
  nftContract,
  feeRecipient,
  walletAddress,
  quantity,
  value,
}) {
  return seaDrop.mintPublic.staticCall(
    nftContract,
    feeRecipient,
    ethers.ZeroAddress,
    BigInt(quantity),
    {
      from: walletAddress,
      value,
    }
  )
}

async function getSeaDropMintStats({ seaDrop, nftContract, walletAddress }) {
  try {
    const token = new ethers.Contract(nftContract, SEADROP_TOKEN_ABI, seaDrop.runner)
    const stats = await token.getMintStats(walletAddress)

    return {
      minterNumMinted: BigInt(stats.minterNumMinted),
      currentTotalSupply: BigInt(stats.currentTotalSupply),
      maxSupply: BigInt(stats.maxSupply),
    }
  } catch (error) {
    return null
  }
}

async function validateSeaDropMintQuantity({
  seaDrop,
  nftContract,
  summary,
  walletAddress,
  quantity,
}) {
  const mintQuantity = BigInt(quantity)

  if (mintQuantity <= 0n) {
    throw new Error("SeaDrop mint quantity must be greater than zero.")
  }

  const stats = await getSeaDropMintStats({ seaDrop, nftContract, walletAddress })

  if (!stats || !summary.maxTotalMintableByWallet) {
    return stats
  }

  const totalAfterMint = stats.minterNumMinted + mintQuantity

  if (totalAfterMint > summary.maxTotalMintableByWallet) {
    const remaining = summary.maxTotalMintableByWallet - stats.minterNumMinted

    throw new Error([
      "SeaDrop wallet mint limit exceeded.",
      `Wallet minted: ${stats.minterNumMinted.toString()}/${summary.maxTotalMintableByWallet.toString()}.`,
      `Requested: ${mintQuantity.toString()}. Remaining: ${remaining > 0n ? remaining.toString() : "0"}.`,
    ].join(" "))
  }

  return stats
}

async function sendSeaDropMint({
  seaDrop,
  nftContract,
  feeRecipient,
  quantity,
  value,
  gasSettings,
}) {
  return seaDrop.mintPublic(
    nftContract,
    feeRecipient,
    ethers.ZeroAddress,
    BigInt(quantity),
    {
      value,
      ...buildGasOverrides(gasSettings),
    }
  )
}

function getSeaDropMintValue({ summary, quantity }) {
  return summary.mintPrice * BigInt(quantity)
}

function formatSeaDropSummary(summary, currency) {
  if (!summary) {
    return "unknown"
  }

  return [
    `Mint price: ${ethers.formatEther(summary.mintPrice)} ${currency}`,
    `Start: ${formatUnixTime(summary.startTime)}`,
    `End: ${formatUnixTime(summary.endTime)}`,
    `Max per wallet: ${summary.maxTotalMintableByWallet.toString()}`,
    `Fee bps: ${summary.feeBps.toString()}`,
    `Restrict fee recipient: ${summary.restrictFeeRecipients ? "yes" : "no"}`,
    `Status: ${formatSeaDropStatus(summary)}`,
  ].join("\n")
}

function formatSeaDropStatus(summary) {
  if (summary.isOpen) {
    return "open"
  }

  if (summary.startTime > summary.blockTimestamp) {
    return `opens at ${formatUnixTime(summary.startTime)}`
  }

  return "closed"
}

function getSeaDropErrorMessage(error) {
  const data = findRevertData(error)

  if (!data) {
    return error.message
  }

  try {
    const parsedError = SEADROP_INTERFACE.parseError(data)

    if (parsedError.name === "MintQuantityExceedsMaxMintedPerWallet") {
      const [total, allowed] = parsedError.args

      return `SeaDrop wallet mint limit exceeded. Total after mint would be ${total.toString()}, but allowed is ${allowed.toString()}. Try a smaller quantity.`
    }

    if (parsedError.name === "IncorrectPayment") {
      const [got, want] = parsedError.args

      return `SeaDrop payment mismatch. Sent ${ethers.formatEther(got)} ETH, required ${ethers.formatEther(want)} ETH.`
    }

    if (parsedError.name === "FeeRecipientNotAllowed") {
      return `SeaDrop fee recipient is not allowed: ${parsedError.args[0]}. Use the drop's allowed fee recipient.`
    }

    if (parsedError.name === "PayerNotAllowed") {
      return `SeaDrop payer is not allowed: ${parsedError.args[0]}.`
    }

    if (parsedError.name === "NotActive") {
      const [, startTimestamp, endTimestamp] = parsedError.args

      return `SeaDrop is not active. Start: ${formatUnixTime(BigInt(startTimestamp))}, End: ${formatUnixTime(BigInt(endTimestamp))}.`
    }

    if (parsedError.name === "MintQuantityCannotBeZero") {
      return "SeaDrop mint quantity must be greater than zero."
    }

    if (parsedError.name === "MintQuantityExceedsMaxSupply") {
      const [total, maxSupply] = parsedError.args

      return `SeaDrop max supply exceeded. Total after mint would be ${total.toString()}, max supply is ${maxSupply.toString()}.`
    }

    if (parsedError.name === "MintQuantityExceedsMaxTokenSupplyForStage") {
      const [total, maxTokenSupplyForStage] = parsedError.args

      return `SeaDrop stage supply exceeded. Total after mint would be ${total.toString()}, stage max is ${maxTokenSupplyForStage.toString()}.`
    }

    return `SeaDrop reverted with ${parsedError.name}.`
  } catch (parseError) {
    return error.message
  }
}

function findRevertData(value) {
  if (!value || typeof value !== "object") {
    return null
  }

  if (typeof value.data === "string" && value.data.startsWith("0x")) {
    return value.data
  }

  if (typeof value.error?.data === "string" && value.error.data.startsWith("0x")) {
    return value.error.data
  }

  if (typeof value.info?.error?.data === "string" && value.info.error.data.startsWith("0x")) {
    return value.info.error.data
  }

  if (value.revert) {
    return findRevertData(value.revert)
  }

  if (value.error) {
    return findRevertData(value.error)
  }

  return null
}

function isPublicDropOpen({ startTime, endTime, now }) {
  if (startTime > now) {
    return false
  }

  if (endTime > 0n && now > endTime) {
    return false
  }

  return true
}

function formatUnixTime(timestamp) {
  return new Date(Number(timestamp) * 1000).toISOString()
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function buildGasOverrides(gasSettings) {
  if (!gasSettings) {
    return {}
  }

  if (gasSettings.gasPrice) {
    return {
      gasPrice: gasSettings.gasPrice,
    }
  }

  const overrides = {}

  if (gasSettings.maxFeePerGas) {
    overrides.maxFeePerGas = gasSettings.maxFeePerGas
  }

  if (gasSettings.maxPriorityFeePerGas) {
    overrides.maxPriorityFeePerGas = gasSettings.maxPriorityFeePerGas
  }

  return overrides
}

module.exports = {
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
}
