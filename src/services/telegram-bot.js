const TelegramBot = require("node-telegram-bot-api")

function createBot() {
  if (!process.env.BOT_TOKEN) {
    throw new Error("Missing BOT_TOKEN in .env")
  }

  return new TelegramBot(process.env.BOT_TOKEN, { polling: true })
}

module.exports = {
  createBot,
}

