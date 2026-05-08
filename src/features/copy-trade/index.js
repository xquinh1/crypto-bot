const { sendFeatureDisabled } = require("../../utils/messages")

function registerCopyTradeCommand({ bot }) {
  bot.onText(/\/copytrade/, (msg) => {
    sendFeatureDisabled(bot, msg.chat.id, "Copy trade")
  })
}

module.exports = {
  registerCopyTradeCommand,
}

