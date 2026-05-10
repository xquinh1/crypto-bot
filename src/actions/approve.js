const { ethers } = require("ethers")
const { parseAddress } = require("../utils/addresses")
const { formatSupportedChains, getChain, getDefaultChain, getRequiredChainWallet } = require("../utils/chainConfig")

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]

async function approve({ chainSlug, tokenAddress, spender, amount, execute = false }) {
  const chain = getChain(chainSlug || getDefaultChain().slug)

  if (!chain) {
    throw new Error(`Unsupported chain: ${chainSlug}\n\n${formatSupportedChains()}`)
  }

  const token = parseAddress(tokenAddress)
  const spenderAddress = parseAddress(spender)

  if (!token) {
    throw new Error("Missing or invalid token address")
  }

  if (!spenderAddress) {
    throw new Error("Missing or invalid spender address")
  }

  const wallet = await getRequiredChainWallet(chain)
  const contract = new ethers.Contract(token, ERC20_ABI, wallet)
  const [decimals, symbol] = await Promise.all([
    contract.decimals(),
    readSymbol(contract),
  ])
  const value = parseApproveAmount({ amount, decimals })

  if (!execute) {
    return {
      action: "approve",
      executed: false,
      text: [
        "Approve preview",
        `Chain: ${chain.name}`,
        `Token: ${token} (${symbol})`,
        `Spender: ${spenderAddress}`,
        `Amount: ${amount || "unlimited"}`,
        "Set AGENT_AUTO_EXECUTE=true to allow the agent to send transactions.",
      ].join("\n"),
    }
  }

  const tx = await contract.approve(spenderAddress, value)

  return {
    action: "approve",
    executed: true,
    hash: tx.hash,
    text: `Approve sent.\nHash: ${tx.hash}`,
  }
}

function parseApproveAmount({ amount, decimals }) {
  if (!amount || String(amount).toLowerCase() === "max" || String(amount).toLowerCase() === "unlimited") {
    return ethers.MaxUint256
  }

  if (!/^\d+(\.\d+)?$/.test(String(amount)) || Number(amount) <= 0) {
    throw new Error("Invalid approve amount")
  }

  return ethers.parseUnits(String(amount), decimals)
}

async function readSymbol(contract) {
  try {
    return await contract.symbol()
  } catch (error) {
    return "TOKEN"
  }
}

module.exports = {
  approve,
}
