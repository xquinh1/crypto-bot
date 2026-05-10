const fs = require("fs/promises")
const path = require("path")
const { execFile, spawn } = require("child_process")
const OpenAI = require("openai")
const { getText } = require("../../services/http-json")

const MAX_CONTEXT_CHARS = 90000
const MAX_PROJECT_DOC_CHARS = 30000
const MAX_FILE_CHARS = 12000
const MAX_TELEGRAM_DOC_BYTES = 512000
const MAX_TELEGRAM_DOC_CHARS = 50000
const MAX_TELEGRAM_CHARS = 3600
const PENDING_TASKS = new Map()
const PROTECTED_PATHS = [
  ".env",
  ".env.example",
  "package-lock.json",
]

function registerCodeAgentCommand({ bot }) {
  bot.onText(/^\/code(?:@\w+)?(?:\s+([\s\S]+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id
    const request = String(match?.[1] || "").trim()

    if (!request) {
      await bot.sendMessage(chatId, "Usage: /code them tinh nang X, sua loi Y, hoac refactor Z")
      return
    }

    if (!process.env.OPENAI_API_KEY) {
      await bot.sendMessage(chatId, "Missing OPENAI_API_KEY in .env")
      return
    }

    await bot.sendMessage(chatId, `Em dang doc repo ${process.cwd()} va tao plan + diff preview...`)

    try {
      const proposal = await createCodeProposal({ request })
      if (proposal.needsClarification) {
        await sendLongMessage(bot, chatId, formatClarification(proposal))
        return
      }

      PENDING_TASKS.set(chatId, proposal)

      await sendLongMessage(bot, chatId, formatProposalPreview(proposal))
    } catch (error) {
      await bot.sendMessage(chatId, `Code agent failed: ${error.message}`)
    }
  })

  bot.onText(/^\/approvecode(?:@\w+)?$/i, async (msg) => {
    const chatId = msg.chat.id
    const proposal = PENDING_TASKS.get(chatId)

    if (!proposal) {
      await bot.sendMessage(chatId, "Khong co code proposal nao dang cho approve. Gui /code <yeu cau> truoc.")
      return
    }

    await bot.sendMessage(chatId, "Da nhan approve. Em dang apply diff, check syntax, commit va push...")

    try {
      const result = await approveCodeProposal(proposal)
      PENDING_TASKS.delete(chatId)

      await sendLongMessage(bot, chatId, formatApproveResult(result))
    } catch (error) {
      await bot.sendMessage(chatId, `Approve failed: ${error.message}`)
    }
  })

  bot.onText(/^\/cancelcode(?:@\w+)?$/i, async (msg) => {
    PENDING_TASKS.delete(msg.chat.id)
    await bot.sendMessage(msg.chat.id, "Da huy code proposal dang cho approve.")
  })

  bot.on("message", async (msg) => {
    if (!msg.document) {
      return
    }

    const chatId = msg.chat.id
    const caption = String(msg.caption || "").trim()
    const fileName = String(msg.document.file_name || "")

    if (!isSupportedCodeDocument(fileName)) {
      return
    }

    if (caption && !caption.toLowerCase().startsWith("/code")) {
      return
    }

    if (!process.env.OPENAI_API_KEY) {
      await bot.sendMessage(chatId, "Missing OPENAI_API_KEY in .env")
      return
    }

    await bot.sendMessage(chatId, `Em da nhan file ${fileName}. Dang doc noi dung va tao plan + diff preview...`)

    try {
      const documentText = await downloadTelegramDocumentText({ bot, document: msg.document })
      const userRequest = caption.replace(/^\/code(?:@\w+)?/i, "").trim()
      const request = [
        userRequest || "Doc file markdown du an nay va viet code de bot thuc hien workflow theo huong dan trong tai lieu.",
        "",
        `Telegram document: ${fileName}`,
        "",
        documentText,
      ].join("\n")
      const proposal = await createCodeProposal({ request })
      if (proposal.needsClarification) {
        await sendLongMessage(bot, chatId, formatClarification(proposal))
        return
      }

      PENDING_TASKS.set(chatId, proposal)

      await sendLongMessage(bot, chatId, formatProposalPreview(proposal))
    } catch (error) {
      await bot.sendMessage(chatId, `Code agent failed: ${error.message}`)
    }
  })
}

async function createCodeProposal({ request }) {
  const repoContext = await buildRepoContext()
  const projectContext = await buildProjectContext(request)
  const gitContext = await buildGitContext()
  let proposal = await requestCodeProposal({
    gitContext,
    projectContext,
    repoContext,
    request,
  })

  if (proposal.needsClarification) {
    return proposal
  }

  const firstValidation = await validateProposalForApply(proposal)

  if (!firstValidation.ok) {
    proposal = await requestCodeProposal({
      feedback: [
        `Previous proposal was invalid: ${firstValidation.error}`,
        "You returned a plan but no valid unified git diff.",
        "Now return a valid unified git diff that touches repository files.",
        "For new files, use diff --git with /dev/null style hunks.",
        "If and only if code cannot be written from the request/document, set needsClarification=true and ask one concrete question.",
      ].join("\n"),
      gitContext,
      projectContext,
      repoContext,
      request,
    })

    if (proposal.needsClarification) {
      return proposal
    }
  }

  const validation = await validateProposalForApply(proposal)

  if (!validation.ok) {
    return {
      ...proposal,
      clarificationQuestion: [
        `AI chua tao duoc diff hop le sau khi retry: ${validation.error}`,
        "Anh gui lai /code voi yeu cau cu the hon: command can them, file/module mong muon, input/output, va hanh dong wallet nao can preview.",
      ].join("\n"),
      needsClarification: true,
    }
  }

  proposal.applyCheck = validation.applyCheck

  return proposal
}

async function requestCodeProposal({ feedback, gitContext, projectContext, repoContext, request }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const response = await client.chat.completions.create({
    model: process.env.CODE_AGENT_MODEL || process.env.OPENAI_INTENT_MODEL || "gpt-4o",
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You are a cautious coding agent editing a Node.js Telegram crypto bot.",
          "Return only JSON with keys: summary, plan, filesChanged, diff, commitMessage, runAfterApprove, needsClarification, clarificationQuestion.",
          "runAfterApprove must be null unless the user explicitly asks the bot to run the new code after approval. When needed, set it to an object with command and args, for example {\"command\":\"npm\",\"args\":[\"run\",\"miner\"]}.",
          "The diff must be a valid unified git diff. Keep changes small and directly related to the request.",
          "If the request is actionable, you must return a non-empty diff that touches at least one file.",
          "If the request is not actionable enough to write code, set needsClarification=true, provide clarificationQuestion in Vietnamese, and set diff to an empty string.",
          "A plan without a diff is not acceptable for actionable coding requests.",
          "Do not edit .env, .env.example, package-lock.json, node_modules, .git, or secret files.",
          "Do not add dependencies unless absolutely required.",
          "Prefer existing project patterns and CommonJS style.",
          "When the user provides a project website or documentation link, use the fetched project context to implement a guarded Telegram workflow for that project.",
          "Wallet access exists through the project's wallet services and PRIVATE_KEY, but generated code must never expose private keys and must always preview risky blockchain actions before execution.",
          "Do not generate code that bypasses explicit user confirmation for wallet signatures, token approvals, transfers, or transaction sends.",
        ].join(" "),
      },
      {
        role: "user",
        content: [
          `User request:\n${request}`,
          "",
          feedback ? `Feedback from previous invalid output:\n${feedback}\n` : null,
          "Git context:",
          gitContext,
          "",
          "Fetched project context from URLs in the request:",
          projectContext || "No URL found or no project context fetched.",
          "",
          "Repository context:",
          repoContext,
        ].filter(Boolean).join("\n"),
      },
    ],
  })

  const rawContent = response.choices[0]?.message?.content || "{}"
  const parsed = JSON.parse(rawContent)
  return normalizeProposal({ parsed, request })
}

async function validateProposalForApply(proposal) {
  try {
    validateDiffIsSafe(proposal.diff)
    return {
      applyCheck: await checkDiffApplies(proposal.diff),
      ok: true,
    }
  } catch (error) {
    return {
      error: error.message,
      ok: false,
    }
  }
}

function normalizeProposal({ parsed, request }) {
  const summary = String(parsed.summary || "").trim() || "Code proposal"
  const plan = Array.isArray(parsed.plan) ? parsed.plan.map(String).filter(Boolean) : []
  const filesChanged = Array.isArray(parsed.filesChanged) ? parsed.filesChanged.map(String).filter(Boolean) : []
  const diff = stripDiffFence(parsed.diff)
  const commitMessage = sanitizeCommitMessage(parsed.commitMessage || `code-agent: ${request}`)
  const runAfterApprove = normalizeRunAfterApprove(parsed.runAfterApprove)
  const needsClarification = Boolean(parsed.needsClarification)
  const clarificationQuestion = String(parsed.clarificationQuestion || "").trim()

  if (!diff && !needsClarification) {
    return {
      clarificationQuestion: [
        "Em doc duoc yeu cau/tai lieu nhung model chua tao duoc diff code hop le.",
        "Anh gui ro hon command can them, chain, contract/API endpoint, va hanh dong bot can lam; hoac gui caption /code cu the hon kem file.",
      ].join("\n"),
      commitMessage,
      createdAt: new Date().toISOString(),
      diff: "",
      filesChanged,
      needsClarification: true,
      plan,
      projectUrls: extractUrls(request),
      repoPath: process.cwd(),
      runAfterApprove,
      request,
      summary,
    }
  }

  return {
    clarificationQuestion,
    commitMessage,
    createdAt: new Date().toISOString(),
    diff,
    filesChanged,
    gitContext: parsed.gitContext,
    needsClarification,
    plan,
    projectUrls: extractUrls(request),
    repoPath: process.cwd(),
    runAfterApprove,
    request,
    summary,
  }
}

async function buildGitContext() {
  const [branch, remote, status] = await Promise.all([
    execFileText("git", ["branch", "--show-current"]).catch((error) => `unknown (${error.message})`),
    execFileText("git", ["remote", "-v"]).catch((error) => `unknown (${error.message})`),
    execFileText("git", ["status", "--short"]).catch((error) => `unknown (${error.message})`),
  ])

  return [
    `Repo path: ${process.cwd()}`,
    `Branch: ${branch || "(detached or unknown)"}`,
    "Remote:",
    remote || "(none)",
    "Current status:",
    status || "(clean)",
  ].join("\n")
}

async function buildProjectContext(request) {
  const urls = extractUrls(request)

  if (!urls.length) {
    return ""
  }

  const blocks = []

  for (const url of urls.slice(0, 3)) {
    try {
      const html = await getText(url, { maxBytes: 512000 })
      const text = htmlToReadableText(html).slice(0, MAX_PROJECT_DOC_CHARS)
      blocks.push([`URL: ${url}`, text].join("\n"))
    } catch (error) {
      blocks.push(`URL: ${url}\nFetch failed: ${error.message}`)
    }
  }

  return blocks.join("\n\n---\n\n")
}

async function downloadTelegramDocumentText({ bot, document }) {
  if (document.file_size && document.file_size > MAX_TELEGRAM_DOC_BYTES) {
    throw new Error(`Document is too large. Max size is ${MAX_TELEGRAM_DOC_BYTES} bytes.`)
  }

  const fileLink = await bot.getFileLink(document.file_id)
  const content = await getText(fileLink, { maxBytes: MAX_TELEGRAM_DOC_BYTES })

  return content.slice(0, MAX_TELEGRAM_DOC_CHARS)
}

function isSupportedCodeDocument(fileName) {
  return /\.(md|markdown|txt)$/i.test(fileName)
}

async function approveCodeProposal(proposal) {
  validateDiffIsSafe(proposal.diff)

  const touchedFiles = extractTouchedFiles(proposal.diff)
  await assertTouchedFilesClean(touchedFiles)
  await applyDiff(proposal.diff)

  const changedFiles = touchedFiles
  const checkResults = await runValidation(changedFiles)

  await gitAdd(changedFiles)
  const commit = await execFileText("git", ["commit", "-m", proposal.commitMessage])
  const push = await execFileText("git", ["push"])
  const runResult = await maybeRunAfterApprove(proposal.runAfterApprove)

  return {
    changedFiles,
    checkResults,
    commit,
    commitMessage: proposal.commitMessage,
    push,
    runResult,
  }
}

async function buildRepoContext() {
  const files = await listContextFiles(process.cwd())
  let context = `Files:\n${files.join("\n")}\n\n`

  for (const file of files) {
    if (context.length >= MAX_CONTEXT_CHARS) {
      break
    }

    const absolutePath = path.join(process.cwd(), file)
    const content = await fs.readFile(absolutePath, "utf8").catch(() => "")
    const clipped = content.length > MAX_FILE_CHARS ? `${content.slice(0, MAX_FILE_CHARS)}\n... [truncated]` : content
    const nextBlock = `\n--- ${file} ---\n${clipped}\n`

    if (context.length + nextBlock.length > MAX_CONTEXT_CHARS) {
      break
    }

    context += nextBlock
  }

  return context
}

async function listContextFiles(root) {
  const results = []

  async function walk(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true })

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name)
      const relativePath = toRepoPath(path.relative(root, absolutePath))

      if (shouldSkipPath(relativePath, entry.isDirectory())) {
        continue
      }

      if (entry.isDirectory()) {
        await walk(absolutePath)
      } else if (isContextFile(relativePath)) {
        results.push(relativePath)
      }
    }
  }

  await walk(root)
  return results.sort()
}

function isContextFile(file) {
  return (
    file === "package.json" ||
    file === "README.md" ||
    file.startsWith("src/") && /\.(js|json|md)$/.test(file)
  )
}

function shouldSkipPath(file, isDirectory) {
  if (!file) {
    return false
  }

  const topLevel = file.split("/")[0]

  if ([".git", "node_modules"].includes(topLevel)) {
    return true
  }

  if (PROTECTED_PATHS.includes(file)) {
    return true
  }

  return !isDirectory && /\.(env|pem|key|crt|p12|sqlite|db)$/i.test(file)
}

function validateDiffIsSafe(diff) {
  const touchedFiles = extractTouchedFiles(diff)

  if (!touchedFiles.length) {
    throw new Error("Diff does not touch any files")
  }

  for (const file of touchedFiles) {
    if (isProtectedEditPath(file)) {
      throw new Error(`Diff tries to edit protected path: ${file}`)
    }
  }
}

function extractTouchedFiles(diff) {
  const files = new Set()
  const patterns = [/^diff --git a\/(.+?) b\/(.+)$/gm, /^\+\+\+ b\/(.+)$/gm, /^--- a\/(.+)$/gm]

  for (const pattern of patterns) {
    let match

    while ((match = pattern.exec(diff))) {
      for (let index = 1; index < match.length; index += 1) {
        const file = match[index]

        if (file && file !== "/dev/null") {
          files.add(toRepoPath(file))
        }
      }
    }
  }

  return Array.from(files)
}

function isProtectedEditPath(file) {
  const normalized = toRepoPath(file)
  const topLevel = normalized.split("/")[0]

  return (
    PROTECTED_PATHS.includes(normalized) ||
    [".git", "node_modules"].includes(topLevel) ||
    /\.(env|pem|key|crt|p12|sqlite|db)$/i.test(normalized)
  )
}

async function checkDiffApplies(diff) {
  try {
    await runWithInput("git", ["apply", "--check"], diff)
    return "ok"
  } catch (error) {
    return `failed: ${error.message}`
  }
}

async function applyDiff(diff) {
  await runWithInput("git", ["apply"], diff)
}

async function assertTouchedFilesClean(files) {
  const existingFiles = []

  for (const file of files) {
    const absolutePath = path.join(process.cwd(), file)

    try {
      await fs.access(absolutePath)
      existingFiles.push(file)
    } catch (error) {
      // New files are allowed.
    }
  }

  if (!existingFiles.length) {
    return
  }

  const output = await execFileText("git", ["status", "--porcelain", "--", ...existingFiles])

  if (output.trim()) {
    throw new Error(`Touched files already have local changes:\n${output}`)
  }
}

async function runValidation(changedFiles) {
  const jsFiles = []
  const results = []

  for (const file of changedFiles) {
    if (!file.endsWith(".js")) {
      continue
    }

    try {
      await fs.access(path.join(process.cwd(), file))
      jsFiles.push(file)
    } catch (error) {
      results.push(`node --check ${file}: skipped, file deleted`)
    }
  }

  for (const file of jsFiles) {
    await execFileText("node", ["--check", file])
    results.push(`node --check ${file}: ok`)
  }

  if (!results.length) {
    results.push("No JS syntax checks needed.")
  }

  return results
}

async function gitAdd(files) {
  if (!files.length) {
    throw new Error("No changed files to commit")
  }

  await execFileText("git", ["add", "--", ...files])
}

async function maybeRunAfterApprove(runAfterApprove) {
  const commandToRun = runAfterApprove || parseDefaultRunAfterApprove()

  if (!commandToRun) {
    return "No runAfterApprove command requested."
  }

  if (process.env.CODE_AGENT_RUN_AFTER_APPROVE !== "true") {
    return "Skipped runAfterApprove because CODE_AGENT_RUN_AFTER_APPROVE is not true."
  }

  assertAllowedRunCommand(commandToRun)

  const timeoutMs = parseRunTimeoutMs()
  const mode = process.env.CODE_AGENT_RUN_MODE || "foreground"

  if (mode === "background") {
    const child = spawn(commandToRun.command, commandToRun.args, {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    })

    child.unref()

    return `Started background process: ${formatCommand(commandToRun)}`
  }

  const output = await execFileText(commandToRun.command, commandToRun.args, { timeoutMs })

  return [
    `Ran: ${formatCommand(commandToRun)}`,
    output || "(no output)",
  ].join("\n")
}

function normalizeRunAfterApprove(value) {
  if (!value || typeof value !== "object") {
    return null
  }

  const command = String(value.command || "").trim()
  const args = Array.isArray(value.args) ? value.args.map((arg) => String(arg)) : []

  if (!command) {
    return null
  }

  return {
    args,
    command,
  }
}

function parseDefaultRunAfterApprove() {
  const rawValue = String(process.env.CODE_AGENT_DEFAULT_RUN_AFTER_APPROVE || "").trim()

  if (!rawValue) {
    return null
  }

  const parts = rawValue.split(/\s+/)

  return {
    args: parts.slice(1),
    command: parts[0],
  }
}

function assertAllowedRunCommand(runAfterApprove) {
  const allowedCommands = getAllowedRunCommands()
  const commandText = formatCommand(runAfterApprove)

  if (!allowedCommands.has(commandText)) {
    throw new Error(`Run command is not allowed: ${commandText}. Add it to CODE_AGENT_ALLOWED_RUN_COMMANDS first.`)
  }
}

function getAllowedRunCommands() {
  return new Set(
    String(process.env.CODE_AGENT_ALLOWED_RUN_COMMANDS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  )
}

function parseRunTimeoutMs() {
  const value = Number(process.env.CODE_AGENT_RUN_TIMEOUT_MS || 120000)

  if (!Number.isInteger(value) || value < 1000 || value > 3600000) {
    throw new Error("Invalid CODE_AGENT_RUN_TIMEOUT_MS")
  }

  return value
}

function execFileText(command, args, { timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd: process.cwd(), timeout: timeoutMs, windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error((stderr || stdout || error.message).trim()))
        return
      }

      resolve(String(stdout || stderr || "").trim())
    })
  })
}

function runWithInput(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), windowsHide: true })
    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString()
    })

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error((stderr || stdout || `Command failed with code ${code}`).trim()))
        return
      }

      resolve(stdout.trim())
    })

    child.stdin.end(input)
  })
}

function formatProposalPreview(proposal) {
  return [
    "Code proposal preview",
    "",
    `Repo: ${proposal.repoPath}`,
    proposal.projectUrls.length ? `Project URL(s): ${proposal.projectUrls.join(", ")}` : "Project URL(s): none",
    "",
    `Request: ${proposal.request}`,
    `Summary: ${proposal.summary}`,
    "",
    "Plan:",
    ...(proposal.plan.length ? proposal.plan.map((item, index) => `${index + 1}. ${item}`) : ["1. No plan returned."]),
    "",
    "Files:",
    ...(proposal.filesChanged.length ? proposal.filesChanged.map((file) => `- ${file}`) : extractTouchedFiles(proposal.diff).map((file) => `- ${file}`)),
    "",
    `Run after approve: ${proposal.runAfterApprove ? formatCommand(proposal.runAfterApprove) : "none"}`,
    `Auto run enabled: ${process.env.CODE_AGENT_RUN_AFTER_APPROVE === "true" ? "yes" : "no"}`,
    "",
    `Diff apply check: ${proposal.applyCheck}`,
    "",
    "Diff:",
    proposal.diff,
    "",
    "Gui /approvecode de apply + commit + push, hoac /cancelcode de huy.",
  ].join("\n")
}

function formatClarification(proposal) {
  return [
    "Code agent needs more detail",
    "",
    `Repo: ${proposal.repoPath}`,
    proposal.projectUrls.length ? `Project URL(s): ${proposal.projectUrls.join(", ")}` : "Project URL(s): none",
    "",
    `Request: ${proposal.request.slice(0, 1200)}`,
    "",
    proposal.summary ? `Summary: ${proposal.summary}` : null,
    proposal.plan.length ? ["Plan/notes:", ...proposal.plan.map((item, index) => `${index + 1}. ${item}`)].join("\n") : null,
    "",
    proposal.clarificationQuestion || "Anh gui them chi tiet de em tao diff code.",
    "",
    "Goi lai bang /code <yeu cau cu the hon> hoac gui lai file voi caption /code ro hon.",
  ].filter(Boolean).join("\n")
}

function formatApproveResult(result) {
  return [
    "Code approved and pushed",
    "",
    `Commit message: ${result.commitMessage}`,
    "",
    "Changed files:",
    ...result.changedFiles.map((file) => `- ${file}`),
    "",
    "Checks:",
    ...result.checkResults.map((line) => `- ${line}`),
    "",
    "Git commit:",
    result.commit || "(no output)",
    "",
    "Git push:",
    result.push || "(no output)",
    "",
    "Run after approve:",
    result.runResult || "(no run output)",
  ].join("\n")
}

async function sendLongMessage(bot, chatId, text) {
  const chunks = splitText(text, MAX_TELEGRAM_CHARS)

  for (const chunk of chunks) {
    await bot.sendMessage(chatId, chunk)
  }
}

function splitText(text, maxLength) {
  const chunks = []
  let remaining = String(text || "")

  while (remaining.length > maxLength) {
    let index = remaining.lastIndexOf("\n", maxLength)

    if (index < maxLength * 0.5) {
      index = maxLength
    }

    chunks.push(remaining.slice(0, index))
    remaining = remaining.slice(index).trimStart()
  }

  if (remaining) {
    chunks.push(remaining)
  }

  return chunks
}

function sanitizeCommitMessage(value) {
  return String(value || "code-agent update")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 120)
}

function formatCommand(runAfterApprove) {
  return [runAfterApprove.command, ...runAfterApprove.args].join(" ")
}

function stripDiffFence(value) {
  const text = String(value || "").trim()
  const match = text.match(/^```(?:diff|patch)?\s*([\s\S]*?)\s*```$/i)

  return (match ? match[1] : text).trim()
}

function extractUrls(text) {
  return Array.from(new Set(String(text || "").match(/https?:\/\/[^\s]+/gi) || []))
}

function htmlToReadableText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim()
}

function toRepoPath(value) {
  return String(value || "").replace(/\\/g, "/")
}

module.exports = {
  registerCodeAgentCommand,
}
