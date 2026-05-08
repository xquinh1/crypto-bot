const { ethers } = require("ethers")

const MINT_NAME_HINTS = ["mint", "publicmint", "freemint", "presalemint"]
const PRICE_FUNCTIONS = [
  "mintPrice",
  "publicMintPrice",
  "price",
  "salePrice",
  "mintFee",
  "cost",
]
const MAX_MINT_FUNCTIONS = [
  "maxMint",
  "maxMintPerWallet",
  "maxMintPerTx",
  "maxPerWallet",
  "MAX_MINT_PER_WALLET",
  "MAX_MINT_PER_TX",
]
const SUPPLY_FUNCTIONS = ["totalSupply", "maxSupply", "MAX_SUPPLY"]
const MINT_OPEN_BOOLEAN_FUNCTIONS = [
  "publicSaleActive",
  "isPublicSaleActive",
  "publicMintActive",
  "isPublicMintActive",
  "saleActive",
  "isSaleActive",
  "mintActive",
  "isMintActive",
  "mintEnabled",
  "publicMintOpen",
  "isPublicMintOpen",
]
const MINT_CLOSED_BOOLEAN_FUNCTIONS = ["paused", "mintPaused", "publicMintPaused", "salePaused"]
const MINT_START_TIME_FUNCTIONS = [
  "publicSaleStartTime",
  "publicMintStartTime",
  "mintStartTime",
  "saleStartTime",
  "startTime",
  "publicSaleStart",
  "publicMintStart",
  "mintStart",
  "saleStart",
]
const MINT_END_TIME_FUNCTIONS = [
  "publicSaleEndTime",
  "publicMintEndTime",
  "mintEndTime",
  "saleEndTime",
  "endTime",
  "publicSaleEnd",
  "publicMintEnd",
  "mintEnd",
  "saleEnd",
]
const DEFAULT_MINT_OPEN_POLL_MS = 5000

function detectMintFunctions(abi) {
  const iface = new ethers.Interface(abi)

  return iface.fragments
    .filter((fragment) => fragment.type === "function")
    .filter((fragment) => ["payable", "nonpayable"].includes(fragment.stateMutability))
    .filter((fragment) => MINT_NAME_HINTS.some((hint) => fragment.name.toLowerCase().includes(hint)))
    .map((fragment) => buildMintFunction(fragment))
    .filter(Boolean)
}

async function getMintSummary({ abi, contract, mintFunctions }) {
  const price = await readFirstValue({ contract, names: PRICE_FUNCTIONS })
  const maxMint = await readFirstValue({ contract, names: MAX_MINT_FUNCTIONS })
  const totalSupply = await readFirstValue({ contract, names: ["totalSupply"] })
  const maxSupply = await readFirstValue({ contract, names: ["maxSupply", "MAX_SUPPLY"] })
  const mintOpenStatus = await getMintOpenStatus({ contract })

  return {
    mintFunctions,
    price,
    maxMint,
    totalSupply,
    maxSupply,
    mintOpenStatus,
    abi,
  }
}

async function readFirstValue({ contract, names }) {
  for (const name of names) {
    try {
      const value = await contract[name]()
      return {
        name,
        value,
      }
    } catch (error) {
      // Keep trying common read method names.
    }
  }

  return null
}

async function getMintOpenStatus({ contract }) {
  const [openFlag, closedFlag, startTime, endTime, blockTimestamp] = await Promise.all([
    readFirstBoolean({ contract, names: MINT_OPEN_BOOLEAN_FUNCTIONS }),
    readFirstBoolean({ contract, names: MINT_CLOSED_BOOLEAN_FUNCTIONS }),
    readFirstTimestamp({ contract, names: MINT_START_TIME_FUNCTIONS }),
    readFirstTimestamp({ contract, names: MINT_END_TIME_FUNCTIONS }),
    getBlockTimestamp(contract),
  ])

  if (closedFlag?.value) {
    return {
      isOpen: false,
      reason: `${closedFlag.name} is true`,
      openFlag,
      closedFlag,
      startTime,
      endTime,
      blockTimestamp,
    }
  }

  if (startTime && blockTimestamp < startTime.value) {
    return {
      isOpen: false,
      reason: `${startTime.name} has not arrived`,
      nextOpenAt: startTime.value,
      openFlag,
      closedFlag,
      startTime,
      endTime,
      blockTimestamp,
    }
  }

  if (endTime && endTime.value > 0n && blockTimestamp > endTime.value) {
    return {
      isOpen: false,
      reason: `${endTime.name} has passed`,
      openFlag,
      closedFlag,
      startTime,
      endTime,
      blockTimestamp,
    }
  }

  if (openFlag && !openFlag.value) {
    return {
      isOpen: false,
      reason: `${openFlag.name} is false`,
      openFlag,
      closedFlag,
      startTime,
      endTime,
      blockTimestamp,
    }
  }

  return {
    isOpen: true,
    reason: openFlag?.name || startTime?.name || "no closed mint condition detected",
    openFlag,
    closedFlag,
    startTime,
    endTime,
    blockTimestamp,
  }
}

async function waitForMintOpen({
  contract,
  pollMs = DEFAULT_MINT_OPEN_POLL_MS,
  onStatus,
}) {
  let status = await getMintOpenStatus({ contract })

  while (!status.isOpen) {
    if (!status.nextOpenAt) {
      return status
    }

    const waitMs = getWaitMsUntil(status.nextOpenAt, status.blockTimestamp, pollMs)

    if (onStatus) {
      await onStatus({ status, waitMs })
    }

    await delay(waitMs)
    status = await getMintOpenStatus({ contract })
  }

  return status
}

async function readFirstBoolean({ contract, names }) {
  for (const name of names) {
    try {
      const value = await contract[name]()

      if (typeof value === "boolean") {
        return {
          name,
          value,
        }
      }
    } catch (error) {
      // Keep trying common read method names.
    }
  }

  return null
}

async function readFirstTimestamp({ contract, names }) {
  const value = await readFirstValue({ contract, names })

  if (!value) {
    return null
  }

  let timestamp

  try {
    timestamp = normalizeTimestamp(BigInt(value.value))
  } catch (error) {
    return null
  }

  if (timestamp <= 0n) {
    return null
  }

  return {
    name: value.name,
    value: timestamp,
  }
}

async function getBlockTimestamp(contract) {
  const block = await contract.runner.provider.getBlock("latest")
  return BigInt(block.timestamp)
}

function normalizeTimestamp(value) {
  if (value > 1000000000000n) {
    return value / 1000n
  }

  return value
}

async function simulateMint({ contract, mintFunction, walletAddress, quantity, value }) {
  const args = buildMintArgs({ mintFunction, walletAddress, quantity })
  const fn = contract.getFunction(mintFunction.signature)

  return fn.staticCall(...args, { value })
}

async function sendMintTransaction({ contract, mintFunction, walletAddress, quantity, value, gasSettings }) {
  const args = buildMintArgs({ mintFunction, walletAddress, quantity })
  const fn = contract.getFunction(mintFunction.signature)

  return fn(...args, {
    value,
    ...buildGasOverrides(gasSettings),
  })
}

function buildMintFunction(fragment) {
  const inputPlan = fragment.inputs.map((input) => getInputRole(input.type))

  if (inputPlan.includes("unsupported")) {
    return null
  }

  if (!inputPlan.includes("quantity")) {
    return null
  }

  return {
    name: fragment.name,
    signature: fragment.format("sighash"),
    payable: fragment.stateMutability === "payable",
    inputs: fragment.inputs.map((input) => input.type),
    inputPlan,
  }
}

function getInputRole(type) {
  if (type === "address") {
    return "recipient"
  }

  if (type.startsWith("uint")) {
    return "quantity"
  }

  return "unsupported"
}

function buildMintArgs({ mintFunction, walletAddress, quantity }) {
  return mintFunction.inputPlan.map((role) => {
    if (role === "recipient") {
      return walletAddress
    }

    if (role === "quantity") {
      return BigInt(quantity)
    }

    throw new Error(`Unsupported mint argument role: ${role}`)
  })
}

function getMintValue({ mintFunction, price, quantity }) {
  if (!mintFunction.payable) {
    return 0n
  }

  if (!price) {
    throw new Error("Mint function is payable, but mint price could not be detected")
  }

  return BigInt(price.value) * BigInt(quantity)
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

function formatValue(value, currency) {
  if (!value) {
    return "unknown"
  }

  return `${ethers.formatEther(value.value)} ${currency} (${value.name})`
}

function formatCount(value) {
  if (!value) {
    return "unknown"
  }

  return `${value.value.toString()} (${value.name})`
}

function formatMintOpenStatus(status) {
  if (!status) {
    return "unknown"
  }

  if (status.isOpen) {
    return `open (${status.reason})`
  }

  if (status.nextOpenAt) {
    return `opens at ${formatUnixTime(status.nextOpenAt)} (${status.reason})`
  }

  return `closed (${status.reason})`
}

function formatUnixTime(timestamp) {
  return new Date(Number(timestamp) * 1000).toISOString()
}

function getWaitMsUntil(targetTimestamp, currentTimestamp, pollMs) {
  const secondsUntilOpen = Number(targetTimestamp - currentTimestamp)
  const waitMs = Math.max(1000, secondsUntilOpen * 1000)

  return Math.min(waitMs, pollMs)
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

module.exports = {
  detectMintFunctions,
  formatCount,
  formatMintOpenStatus,
  formatValue,
  getMintOpenStatus,
  getMintSummary,
  getMintValue,
  sendMintTransaction,
  simulateMint,
  waitForMintOpen,
}
