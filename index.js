require("dotenv").config()

const { createBot } = require("./src/services/telegram-bot")
const { createWalletContext } = require("./src/services/wallet")
const { registerFeatures } = require("./src/features")
const { registerAgentHandler } = require("./src/agent/agentHandler")

const bot = createBot()
const walletContext = createWalletContext()

registerFeatures({
  bot,
  ...walletContext,
})

registerAgentHandler({
  bot,
  ...walletContext,
})
