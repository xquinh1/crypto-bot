const { getJson } = require("./http-json")

async function fetchContractAbi({ chain, address }) {
  const url = new URL("https://api.etherscan.io/v2/api")
  const apiKey = process.env.ETHERSCAN_API_KEY

  url.searchParams.set("chainid", String(chain.chainId))
  url.searchParams.set("module", "contract")
  url.searchParams.set("action", "getabi")
  url.searchParams.set("address", address)

  if (!apiKey) {
    throw new Error("Missing ETHERSCAN_API_KEY in .env")
  }

  url.searchParams.set("apikey", apiKey)

  const response = await getJson(url.toString())

  if (response.status !== "1") {
    throw new Error(response.result || response.message || "Explorer ABI fetch failed")
  }

  return JSON.parse(response.result)
}

function getTransactionUrl(chain, hash) {
  return `${chain.explorerBaseUrl}/tx/${hash}`
}

function getAddressUrl(chain, address) {
  return `${chain.explorerBaseUrl}/address/${address}`
}

module.exports = {
  fetchContractAbi,
  getAddressUrl,
  getTransactionUrl,
}
