const TelegramBot = require("node-telegram-bot-api")

const DEFAULT_ALLOWED_USERNAMES = ["xnqnh0320"]

function createBot() {
  if (!process.env.BOT_TOKEN) {
    throw new Error("Missing BOT_TOKEN in .env")
  }

  const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

  return applyAllowlist(bot)
}

function applyAllowlist(bot) {
  const originalOn = bot.on.bind(bot)
  const originalOnText = bot.onText.bind(bot)

  bot.on = (event, listener) => {
    if (event === "message") {
      return originalOn(event, guardMessageHandler(bot, listener))
    }

    if (event === "callback_query") {
      return originalOn(event, guardCallbackHandler(bot, listener))
    }

    return originalOn(event, listener)
  }

  bot.onText = (regexp, callback) => {
    return originalOnText(regexp, guardOnTextHandler(bot, callback))
  }

  return bot
}

function guardMessageHandler(bot, listener) {
  return async (msg, ...args) => {
    if (!isAllowedTelegramUser(msg?.from)) {
      if (String(msg?.text || "").trim().startsWith("/")) {
        return
      }

      await denyMessage(bot, msg)
      return
    }

    return listener(msg, ...args)
  }
}

function guardOnTextHandler(bot, callback) {
  return async (msg, match, ...args) => {
    if (!isAllowedTelegramUser(msg?.from)) {
      await denyMessage(bot, msg)
      return
    }

    return callback(msg, match, ...args)
  }
}

function guardCallbackHandler(bot, listener) {
  return async (query, ...args) => {
    if (!isAllowedTelegramUser(query?.from)) {
      await denyCallback(bot, query)
      return
    }

    return listener(query, ...args)
  }
}

function isAllowedTelegramUser(from) {
  const allowedUsernames = getAllowedTelegramUsernames()
  const username = normalizeUsername(from?.username)

  return Boolean(username && allowedUsernames.has(username))
}

function getAllowedTelegramUsernames() {
  const rawValue = process.env.ALLOWED_TELEGRAM_USERNAMES || DEFAULT_ALLOWED_USERNAMES.join(",")

  return new Set(
    rawValue
      .split(",")
      .map(normalizeUsername)
      .filter(Boolean)
  )
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase()
}

async function denyMessage(bot, msg) {
  const chatId = msg?.chat?.id

  if (!chatId) {
    return
  }

  await bot.sendMessage(chatId, "Unauthorized Telegram user.")
}

async function denyCallback(bot, query) {
  if (query?.id) {
    await bot.answerCallbackQuery(query.id, {
      text: "Unauthorized Telegram user.",
      show_alert: true,
    })
  }
}

module.exports = {
  createBot,
  getAllowedTelegramUsernames,
  isAllowedTelegramUser,
}
