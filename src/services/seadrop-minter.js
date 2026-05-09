const { ethers } = require("ethers")

const DEFAULT_SEADROP_ADDRESS = "0x00005EA00Ac477B1030CE78506496e8C2dE24bf5"
const DEFAULT_FEE_RECIPIENT = "0x0000a26b00c1F0DF003000390027140000fAa719"
const SEADROP_ABI = [
  "function getPublicDrop(address nftContract) view returns ((uint80 mintPrice,uint48 startTime,uint48 endTime,uint16 maxTotalMintableByWallet,uint16 feeBps,bool restrictFeeRecipients))",
  "function mintPublic(address nftContract,address feeRecipient,address minterIfNotPayer,uint256 quantity) payable",
]

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
  getSeaDropMintValue,
  getSeaDropSummary,
  sendSeaDropMint,
  simulateSeaDropMint,
  waitForSeaDropOpen,
}
