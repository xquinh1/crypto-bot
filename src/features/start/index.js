const { mainMenuKeyboard, mintChainsKeyboard } = require("../../utils/telegram-ui")

function registerStartCommand({ bot }) {
  bot.setMyCommands([
    { command: "start", description: "Open main menu" },
    { command: "balance", description: "Check bot wallet balance" },
    { command: "portfolio", description: "Show bot wallet portfolio" },
    { command: "mintchains", description: "List supported mint chains" },
    { command: "mint", description: "Prepare NFT mint: /mint base 0xContract" },
    { command: "confirmmint", description: "Confirm pending mint: /confirmmint 1" },
    { command: "trackwallet", description: "Track wallet: /trackwallet 0xAddress" },
    { command: "trackedwallets", description: "List tracked wallets" },
    { command: "revoke", description: "Check revoke target: /revoke 0xAddress" },
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
        "/trackwallet 0xAddress - Track native balance changes",
        "/trackedwallets - List tracked wallets",
        "/revoke 0xAddress - Check revoke target",
        "/mintchains - List supported mint chains",
        "/mint base 0xContract - Fetch ABI and prepare NFT mint",
        "/confirmmint 1 - Simulate and send pending mint",
        "/automint - Auto mint module status",
        "/copytrade - Copy trade module status",
        "/sniper - Sniper bot module status",
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
      "menu:wallet_tracker": "/trackwallet 0xWalletAddress",
      "menu:revoke_checker": "/revoke 0xWalletAddress",
      "menu:copy_trade": "/copytrade",
      "menu:sniper_bot": "/sniper",
    }

    bot.sendMessage(chatId, messages[data] || "Unknown menu action.")
  })
}

module.exports = {
  registerStartCommand,
}
