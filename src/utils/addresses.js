const { ethers } = require("ethers")

function parseAddress(value) {
  const address = extractAddress(value)

  if (!address || !ethers.isAddress(address)) {
    return null
  }

  return ethers.getAddress(address)
}

function extractAddress(value) {
  const match = String(value || "").match(/0x[a-fA-F0-9]{40}/)

  return match ? match[0] : null
}

module.exports = {
  parseAddress,
}
