const OpenAI = require("openai")
const { parseAddress } = require("../utils/addresses")
const { tools } = require("./tools")

const DEFAULT_MODEL = "gpt-4o"

function createIntentParser() {
  if (process.env.FORCE_LOCAL_INTENT_PARSER === "true" || !process.env.OPENAI_API_KEY) {
    return {
      parseIntent: async (message) => parseLocalIntent(message),
    }
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  return {
    parseIntent: (message) => parseIntent({ client, message }),
  }
}

async function parseIntent({ client, message }) {
  let response

  try {
    response = await client.chat.completions.create({
      model: process.env.OPENAI_INTENT_MODEL || DEFAULT_MODEL,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: [
            "You parse Telegram messages for a crypto wallet bot.",
            "Reply naturally in Vietnamese when the user is chatting, asking vague questions, or has not provided enough actionable details.",
            "Pick exactly one tool when the user asks for balance, transfer, approve, mint, or project website mining/farming/airdrop work.",
            "Swap and bridge are disabled. Reply in Vietnamese that those features are currently disabled instead of calling a tool.",
            "Use chainSlug values: eth, sepolia, base, arbitrum, optimism, polygon, bsc, or all.",
            "For requests like 'mine token from this website' or 'farm this project' with a URL, call inspect_project_link.",
            "The bot cannot access Gmail, email inboxes, browser sessions, or external accounts directly. If the user asks you to access Gmail/email, reply in Vietnamese that they should forward/paste the email content or send the project link; if their message includes a URL, inspect that URL.",
            "Do not invent addresses or amounts. If required arguments are missing, do not call a tool.",
            "Never claim you executed blockchain transactions, wallet signatures, or web actions unless a tool is called and returns that result.",
          ].join(" "),
        },
        {
          role: "user",
          content: String(message || ""),
        },
      ],
      tools,
      tool_choice: "auto",
    })
  } catch (error) {
    return parseLocalIntent(message, {
      reason: `OpenAI dang loi hoac het quota (${error.status || error.code || "unknown"}), em tam dung che do test local.`,
    })
  }

  const toolCall = response.choices[0]?.message?.tool_calls?.[0]

  if (!toolCall) {
    return {
      toolName: "chat",
      args: {},
      text: response.choices[0]?.message?.content || "Em nghe day. Anh gui ro muc tieu hoac link du an, em se xu ly tiep.",
    }
  }

  return {
    toolName: toolCall.function.name,
    args: JSON.parse(toolCall.function.arguments || "{}"),
  }
}

function parseLocalIntent(message, { reason } = {}) {
  const text = String(message || "").trim()
  const lowerText = text.toLowerCase()
  const chainSlug = extractChainSlug(lowerText)
  const url = extractUrl(text)
  const addresses = extractAddresses(text)
  const amount = extractAmount(text)

  if (url && hasAny(lowerText, ["mine", "farm", "claim", "airdrop", "web", "link", "project", "du an", "mint"])) {
    return {
      toolName: "inspect_project_link",
      args: {
        goal: text.replace(url, "").trim() || "inspect project website",
        url,
      },
    }
  }

  if (hasAny(lowerText, ["gmail", "email", "mail", "inbox", "hop thu", "hộp thư"])) {
    return {
      toolName: "chat",
      args: {},
      text: "Em chua co quyen truy cap Gmail/email truc tiep. Anh forward hoac paste noi dung email vao day, hoac gui link du an/token trong email; neu co link em se inspect tiep cho anh.",
    }
  }

  if (hasAny(lowerText, ["swap", "doi", "mua", "ban", "bridge", "bridging", "cau", "chuyen mang", "sang mang"])) {
    return {
      toolName: "chat",
      args: {},
      text: "Tinh nang swap va bridge hien dang tat de tranh gui giao dich nham. Anh co the dung balance, transfer, approve, mint hoac inspect link.",
    }
  }

  if (hasAny(lowerText, ["balance", "so du", "check vi", "vi cua t", "wallet"])) {
    return {
      toolName: "balance",
      args: {
        chainSlug: chainSlug || (lowerText.includes("all") ? "all" : undefined),
        address: addresses[0],
      },
    }
  }

  if (hasAny(lowerText, ["transfer", "send", "chuyen"]) && addresses[0] && amount) {
    return {
      toolName: "transfer",
      args: {
        amount,
        chainSlug,
        to: addresses[0],
      },
    }
  }

  if (hasAny(lowerText, ["approve", "allow"]) && addresses.length >= 2) {
    return {
      toolName: "approve",
      args: {
        amount: amount || "unlimited",
        chainSlug,
        spender: addresses[1],
        tokenAddress: addresses[0],
      },
    }
  }

  if (hasAny(lowerText, ["mint"]) && addresses[0]) {
    return {
      toolName: "mint",
      args: {
        chainSlug,
        contractAddress: addresses[0],
      },
    }
  }

  return {
    toolName: "chat",
    args: {},
    text: [
      reason,
      "Em dang chay che do test local nen hieu duoc cac lenh co ban: balance, transfer, approve, mint, inspect link.",
      "Tinh nang swap va bridge hien dang tat.",
    ].filter(Boolean).join("\n"),
  }
}

function extractUrl(text) {
  const match = String(text || "").match(/https?:\/\/[^\s]+/i)

  return match ? match[0] : null
}

function extractAddresses(text) {
  const matches = String(text || "").match(/0x[a-fA-F0-9]{40}/g) || []

  return matches.map(parseAddress).filter(Boolean)
}

function extractAmount(text) {
  const match = String(text || "").match(/\b\d+(?:\.\d+)?\b/)

  return match ? match[0] : null
}

function extractChainSlug(text) {
  const aliases = {
    arb: "arbitrum",
    arbitrum: "arbitrum",
    base: "base",
    bnb: "bsc",
    bsc: "bsc",
    eth: "eth",
    ethereum: "eth",
    op: "optimism",
    optimism: "optimism",
    polygon: "polygon",
    sepolia: "sepolia",
  }

  for (const [alias, slug] of Object.entries(aliases)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(text)) {
      return slug
    }
  }

  return undefined
}

function hasAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword))
}

module.exports = {
  createIntentParser,
  parseLocalIntent,
}
