const { parseAddress } = require("../../utils/addresses")

function registerRevokeCheckerCommand({ bot }) {
  bot.onText(/\/revoke(?:\s+(.+))?/, (msg, match) => {
    const address = parseAddress(match[1])

    if (!address) {
      bot.sendMessage(msg.chat.id, "Usage: /revoke 0xWalletAddress")
      return
    }

    bot.sendMessage(
      msg.chat.id,
      [
        `Revoke checker target: ${address}`,
        "Approval scanning needs a chain indexer or explorer API before it can return token allowances.",
      ].join("\n")
    )
  })
}

module.exports = {
  registerRevokeCheckerCommand,
}

