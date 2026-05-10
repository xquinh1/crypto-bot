const { registerStartCommand } = require("./start")
const { registerBalanceCommand } = require("./check-balance")
const { registerCodeAgentCommand } = require("./code-agent")
const { registerMintNftCommand } = require("./mint-nft")
const { registerSeaDropMintCommand } = require("./seadrop-mint")
const { registerPortfolioTrackerCommand } = require("./portfolio-tracker")

function registerFeatures(context) {
  registerStartCommand(context)
  registerBalanceCommand(context)
  registerCodeAgentCommand(context)
  registerMintNftCommand(context)
  registerSeaDropMintCommand(context)
  registerPortfolioTrackerCommand(context)
}

module.exports = {
  registerFeatures,
}
