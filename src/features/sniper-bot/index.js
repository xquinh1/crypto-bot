const { sendFeatureDisabled } = require("../../utils/messages")

function registerSniperBotCommand({ bot }) {
  bot.onText(/\/sniper/, (msg) => {
    sendFeatureDisabled(bot, msg.chat.id, "Sniper bot")
  })
}

module.exports = {
  registerSniperBotCommand,
}

