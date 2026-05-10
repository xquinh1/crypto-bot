const { getDefaultChain, getRequiredChainWallet } = require("./chainConfig")

let walletPromise = null

function getWallet(chain = getDefaultChain()) {
  if (!walletPromise || walletPromise.chainSlug !== chain.slug) {
    walletPromise = getRequiredChainWallet(chain)
    walletPromise.chainSlug = chain.slug
  }

  return walletPromise
}

function resetWalletSingleton() {
  walletPromise = null
}

module.exports = {
  getWallet,
  resetWalletSingleton,
}
