function sendFeatureDisabled(bot, chatId, featureName) {
  bot.sendMessage(
    chatId,
    `${featureName} is scaffolded but disabled. Set ENABLE_TRADING_AUTOMATION=true only after strategy, risk limits, and contract config are implemented.`
  )
}

module.exports = {
  sendFeatureDisabled,
}

