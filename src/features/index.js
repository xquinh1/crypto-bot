const { registerStartCommand } = require("./start")
const { registerBalanceCommand } = require("./check-balance")
const { registerMintNftCommand } = require("./mint-nft")
const { registerWalletTrackerCommand } = require("./wallet-tracker")
const { registerCopyTradeCommand } = require("./copy-trade")
const { registerAutoMintCommand } = require("./auto-mint")
const { registerRevokeCheckerCommand } = require("./revoke-checker")
const { registerSniperBotCommand } = require("./sniper-bot")
const { registerPortfolioTrackerCommand } = require("./portfolio-tracker")

function registerFeatures(context) {
  registerStartCommand(context)
  registerBalanceCommand(context)
  registerMintNftCommand(context)
  registerWalletTrackerCommand(context)
  registerCopyTradeCommand(context)
  registerAutoMintCommand(context)
  registerRevokeCheckerCommand(context)
  registerSniperBotCommand(context)
  registerPortfolioTrackerCommand(context)
}

module.exports = {
  registerFeatures,
}
