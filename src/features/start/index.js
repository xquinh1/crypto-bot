const { mainMenuKeyboard, mintChainsKeyboard } = require("../../utils/telegram-ui")

function registerStartCommand({ bot }) {
  bot.setMyCommands([
    { command: "start", description: "Open main menu" },
    { command: "balance", description: "Check bot wallet balance" },
    { command: "portfolio", description: "Show bot wallet portfolio" },
    { command: "mintchains", description: "List supported mint chains" },
    { command: "mint", description: "Prepare NFT mint: /mint base 0xContract" },
    { command: "confirmmint", description: "Confirm pending mint: /confirmmint 1" },
  ])

  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      [
        "Bot online",
        "",
        "Commands:",
        "/balance - Check bot wallet balance",
        "/portfolio - Show bot wallet portfolio",
        "/mintchains - List supported mint chains",
        "/mint base 0xContract - Fetch ABI and prepare NFT mint",
        "/confirmmint 1 - Simulate and send pending mint",
      ].join("\n"),
      mainMenuKeyboard()
    )
  })

  bot.on("callback_query", async (query) => {
    const chatId = query.message.chat.id
    const data = query.data || ""

    if (!data.startsWith("menu:") && !data.startsWith("mint_help:")) {
      return
    }

    await bot.answerCallbackQuery(query.id)

    if (data === "menu:mint") {
      bot.sendMessage(
        chatId,
        [
          "Choose a chain below, then send the contract command.",
          "",
          "Example:",
          "/mint base 0xContractAddress",
        ].join("\n"),
        mintChainsKeyboard()
      )
      return
    }

    if (data.startsWith("mint_help:")) {
      const chainSlug = data.split(":")[1]
      bot.sendMessage(
        chatId,
        [
          `Mint on ${chainSlug}:`,
          `/mint ${chainSlug} 0xContractAddress`,
        ].join("\n")
      )
      return
    }

    const messages = {
      "menu:portfolio": "/portfolio",
    }

    bot.sendMessage(chatId, messages[data] || "Unknown menu action.")
  })
}

module.exports = {
  registerStartCommand,
}
