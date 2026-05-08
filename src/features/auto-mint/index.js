const { sendFeatureDisabled } = require("../../utils/messages")

function registerAutoMintCommand({ bot }) {
  bot.onText(/\/automint/, (msg) => {
    sendFeatureDisabled(bot, msg.chat.id, "Auto mint")
  })
}

module.exports = {
  registerAutoMintCommand,
}

