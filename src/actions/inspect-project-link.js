const { getText } = require("../services/http-json")

async function inspectProjectLink({ url, goal }) {
  const normalizedUrl = normalizeUrl(url)

  if (!normalizedUrl) {
    throw new Error("Missing or invalid project URL")
  }

  const html = await getText(normalizedUrl)
  const page = extractPageSummary(html)
  const riskNotes = detectRiskNotes({ html, url: normalizedUrl })

  return {
    action: "inspect_project_link",
    executed: false,
    text: [
      `Em mở được link dự án rồi: ${normalizedUrl}`,
      goal ? `Mục tiêu anh muốn làm: ${goal}` : null,
      "",
      page.title ? `Title: ${page.title}` : null,
      page.description ? `Mô tả: ${page.description}` : null,
      page.links.length ? `Link đáng chú ý:\n${page.links.map((link) => `- ${link}`).join("\n")}` : null,
      riskNotes.length ? `\nĐiểm cần kiểm tra:\n${riskNotes.map((note) => `- ${note}`).join("\n")}` : null,
      "",
      [
        "Bước tiếp theo hợp lý là anh gửi thêm network/wallet muốn dùng, hoặc bảo em phân tích sâu contract/task.",
        "Em sẽ không tự connect ví, ký message hay gửi transaction nếu chưa có bước preview và xác nhận rõ từ anh.",
      ].join("\n"),
    ].filter(Boolean).join("\n"),
  }
}

function normalizeUrl(value) {
  try {
    const url = new URL(String(value || "").trim())

    if (!["http:", "https:"].includes(url.protocol)) {
      return null
    }

    return url.toString()
  } catch (error) {
    return null
  }
}

function extractPageSummary(html) {
  const title = decodeHtml(readTag(html, "title"))
  const description = decodeHtml(readMeta(html, "description") || readMeta(html, "og:description"))
  const links = extractLinks(html).slice(0, 8)

  return {
    description,
    links,
    title,
  }
}

function readTag(html, tagName) {
  const match = String(html || "").match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i"))

  return match ? stripWhitespace(match[1]) : ""
}

function readMeta(html, name) {
  const escapedName = escapeRegExp(name)
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escapedName}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapedName}["'][^>]*>`, "i"),
  ]

  for (const pattern of patterns) {
    const match = String(html || "").match(pattern)

    if (match) {
      return stripWhitespace(match[1])
    }
  }

  return ""
}

function extractLinks(html) {
  const links = []
  const pattern = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = pattern.exec(String(html || "")))) {
    const href = match[1]
    const label = decodeHtml(stripTags(match[2]))

    if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
      continue
    }

    links.push(label ? `${label}: ${href}` : href)
  }

  return Array.from(new Set(links))
}

function detectRiskNotes({ html, url }) {
  const text = String(html || "").toLowerCase()
  const notes = []

  if (url.startsWith("http:")) {
    notes.push("Website đang dùng HTTP, không nên connect ví trên link này.")
  }

  if (text.includes("connect wallet") || text.includes("walletconnect")) {
    notes.push("Site có luồng connect wallet; cần xem kỹ domain và transaction preview trước khi ký.")
  }

  if (text.includes("claim") || text.includes("airdrop")) {
    notes.push("Có dấu hiệu claim/airdrop; cần kiểm tra contract và phí/gas trước khi làm.")
  }

  if (text.includes("approve")) {
    notes.push("Có dấu hiệu approve token; không nên approve unlimited nếu chưa rõ spender.")
  }

  return notes
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ")
}

function stripWhitespace(value) {
  return stripTags(value).replace(/\s+/g, " ").trim()
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

module.exports = {
  inspectProjectLink,
}
