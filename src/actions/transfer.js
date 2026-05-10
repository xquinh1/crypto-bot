const { ethers } = require("ethers")
const { parseAddress } = require("../utils/addresses")
const { formatSupportedChains, getChain, getDefaultChain, getRequiredChainWallet } = require("../utils/chainConfig")

const ERC20_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]

async function transfer({ chainSlug, to, amount, tokenAddress, execute = false }) {
  const chain = getChain(chainSlug || getDefaultChain().slug)

  if (!chain) {
    throw new Error(`Unsupported chain: ${chainSlug}\n\n${formatSupportedChains()}`)
  }

  const recipient = parseAddress(to)

  if (!recipient) {
    throw new Error("Missing or invalid recipient address")
  }

  if (!isPositiveNumberString(amount)) {
    throw new Error("Missing or invalid amount")
  }

  const wallet = await getRequiredChainWallet(chain)

  if (!tokenAddress) {
    return transferNative({ chain, wallet, recipient, amount, execute })
  }

  const token = parseAddress(tokenAddress)

  if (!token) {
    throw new Error("Invalid token address")
  }

  return transferErc20({ chain, wallet, token, recipient, amount, execute })
}

async function transferNative({ chain, wallet, recipient, amount, execute }) {
  const value = ethers.parseEther(amount)
  const request = {
    to: recipient,
    value,
  }

  if (!execute) {
    return {
      action: "transfer",
      executed: false,
      text: [
        "Transfer preview",
        `Chain: ${chain.name}`,
        `To: ${recipient}`,
        `Amount: ${amount} ${chain.currency}`,
        "Set AGENT_AUTO_EXECUTE=true to allow the agent to send transactions.",
      ].join("\n"),
    }
  }

  const tx = await wallet.sendTransaction(request)

  return {
    action: "transfer",
    executed: true,
    hash: tx.hash,
    text: `Transfer sent.\nHash: ${tx.hash}`,
  }
}

async function transferErc20({ chain, wallet, token, recipient, amount, execute }) {
  const contract = new ethers.Contract(token, ERC20_ABI, wallet)
  const [decimals, symbol] = await Promise.all([
    contract.decimals(),
    readSymbol(contract),
  ])
  const value = ethers.parseUnits(amount, decimals)

  if (!execute) {
    return {
      action: "transfer",
      executed: false,
      text: [
        "ERC20 transfer preview",
        `Chain: ${chain.name}`,
        `Token: ${token} (${symbol})`,
        `To: ${recipient}`,
        `Amount: ${amount} ${symbol}`,
        "Set AGENT_AUTO_EXECUTE=true to allow the agent to send transactions.",
      ].join("\n"),
    }
  }

  const tx = await contract.transfer(recipient, value)

  return {
    action: "transfer",
    executed: true,
    hash: tx.hash,
    text: `ERC20 transfer sent.\nHash: ${tx.hash}`,
  }
}

async function readSymbol(contract) {
  try {
    return await contract.symbol()
  } catch (error) {
    return "TOKEN"
  }
}

function isPositiveNumberString(value) {
  return /^\d+(\.\d+)?$/.test(String(value || "")) && Number(value) > 0
}

module.exports = {
  transfer,
}
