const { parseAddress } = require("../utils/addresses")
const { formatSupportedChains, getChain, getDefaultChain } = require("../utils/chainConfig")

async function mint({ chainSlug, contractAddress, quantity }) {
  const chain = getChain(chainSlug || getDefaultChain().slug)

  if (!chain) {
    throw new Error(`Unsupported chain: ${chainSlug}\n\n${formatSupportedChains()}`)
  }

  const contract = parseAddress(contractAddress)

  if (!contract) {
    throw new Error("Missing or invalid mint contract address")
  }

  return {
    action: "mint",
    executed: false,
    text: [
      "Mint intent detected.",
      `Chain: ${chain.name}`,
      `Contract: ${contract}`,
      quantity ? `Quantity: ${quantity}` : "Quantity: choose during confirmation",
      "",
      `Start the guarded mint flow with: /mint ${chain.slug} ${contract}`,
      "Then confirm from Telegram after ABI detection and simulation.",
    ].join("\n"),
  }
}

module.exports = {
  mint,
}
