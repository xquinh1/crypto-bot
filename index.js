require("dotenv").config()

const { createBot } = require("./src/services/telegram-bot")
const { createWalletContext } = require("./src/services/wallet")
const { registerFeatures } = require("./src/features")

const bot = createBot()
const walletContext = createWalletContext()

registerFeatures({
  bot,
  ...walletContext,
})
