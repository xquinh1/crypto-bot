const { mainMenuKeyboard, mintChainsKeyboard } = require("../../utils/telegram-ui")

function registerStartCommand({ bot }) {
  bot.setMyCommands([
    { command: "start", description: "Open main menu" },
    { command: "balance", description: "Check bot wallet balance" },
    { command: "portfolio", description: "Show bot wallet portfolio" },
    { command: "mintchains", description: "List supported mint chains" },
    { command: "mint", description: "Prepare NFT mint: /mint base 0xContract" },
    { command: "confirmmint", description: "Confirm pending mint: /confirmmint 1" },
    { command: "code", description: "Create code plan and diff preview" },
    { command: "approvecode", description: "Apply approved code proposal" },
    { command: "cancelcode", description: "Cancel pending code proposal" },
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
        "/code request - Create plan + diff preview",
        "/approvecode - Apply, commit and push pending code proposal",
        "/cancelcode - Cancel pending code proposal",
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
      "menu:code_agent": "/code sua loi hoac them tinh nang...",
    }

    bot.sendMessage(chatId, messages[data] || "Unknown menu action.")
  })
}

module.exports = {
  registerStartCommand,
}
