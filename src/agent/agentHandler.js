const { approve } = require("../actions/approve")
const { checkBalance } = require("../actions/balance")
const { inspectProjectLink } = require("../actions/inspect-project-link")
const { mint } = require("../actions/mint")
const { transfer } = require("../actions/transfer")
const { createIntentParser } = require("./intentParser")

function registerAgentHandler({ bot, wallet }) {
  const parser = createIntentParser()

  bot.on("message", async (msg) => {
    const text = String(msg.text || "").trim()

    if (!text || text.startsWith("/")) {
      return
    }

    const chatId = msg.chat.id

    try {
      const intent = await parser.parseIntent(text)
      const result = await handleIntent({
        intent,
        wallet,
        execute: process.env.AGENT_AUTO_EXECUTE === "true",
      })

      bot.sendMessage(chatId, result.text)
    } catch (error) {
      bot.sendMessage(chatId, `Agent failed: ${error.message}`)
    }
  })
}

async function handleIntent({ intent, wallet, execute = false }) {
  switch (intent.toolName) {
    case "chat":
      return {
        action: "chat",
        text: intent.text || "Em nghe đây. Anh nói tiếp đi, em sẽ xử lý theo mục tiêu của anh.",
      }
    case "balance":
      return checkBalance({
        ...intent.args,
        wallet,
      })
    case "transfer":
      return transfer({
        ...intent.args,
        execute,
      })
    case "mint":
      return mint(intent.args)
    case "approve":
      return approve({
        ...intent.args,
        execute,
      })
    case "inspect_project_link":
      return inspectProjectLink(intent.args)
    default:
      return {
        action: "chat",
        text: intent.reason || "Em chưa rõ việc cần làm. Anh gửi thêm mục tiêu, chain, contract hoặc link dự án nhé.",
      }
  }
}

module.exports = {
  handleIntent,
  registerAgentHandler,
}
