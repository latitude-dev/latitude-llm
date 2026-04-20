import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { postTraces } from "./client.ts"
import { loadConfig } from "./config.ts"
import { collectTraceContext } from "./context.ts"
import type { Logger } from "./logger.ts"
import { createLogger } from "./logger.ts"
import { buildOtlpRequest } from "./otlp.ts"
import { deleteRequest, loadRequestsByMessageId, pruneStaleRequests } from "./request-store.ts"
import { load, save, stateKey, withLock } from "./state.ts"
import {
  buildTurns,
  discoverSubagentFiles,
  firstPromptIdOf,
  readAllTurns,
  readIncremental,
  readSubagentMeta,
} from "./transcript.ts"
import type { AssistantCall, HookPayload, SubagentFile, ToolCall, TranscriptRow, Turn } from "./types.ts"

const INTERCEPT_INSTALL_PATH = join(homedir(), ".claude", "state", "latitude", "intercept.js")

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return ""
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString("utf-8")
}

function parsePayload(raw: string): HookPayload {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed) as HookPayload
  } catch {
    return {}
  }
}

function pickSession(p: HookPayload): { sessionId?: string | undefined; transcriptPath?: string | undefined } {
  return {
    sessionId: p.session_id ?? p.sessionId,
    transcriptPath: p.transcript_path ?? p.transcriptPath,
  }
}

async function main(): Promise<void> {
  const subcommand = process.argv[2]
  if (subcommand === "install-preload" || subcommand === "install") {
    runInstallPreload()
    return
  }

  const config = loadConfig()
  const logger = createLogger(config.debug)

  if (!config.enabled) {
    if (config.apiKey === "") logger.debug("disabled: LATITUDE_API_KEY is empty")
    if (config.project === "") logger.debug("disabled: LATITUDE_PROJECT is empty")
    return
  }
  logger.debug(`enabled: project=${config.project} base=${config.baseUrl}`)

  // Materialize the intercept preload to a stable path so users can reference it from
  // settings.json once and receive bundle updates for free on subsequent hook runs.
  materializeIntercept(logger)

  const raw = await readStdin()
  const payload = parsePayload(raw)
  const { sessionId, transcriptPath } = pickSession(payload)
  if (!sessionId || !transcriptPath) {
    logger.debug(`missing session_id or transcript_path in hook payload (stdin was ${raw.length} bytes)`)
    return
  }
  logger.debug(`session=${sessionId} transcript=${transcriptPath}`)

  // Claude Code's transcript writes and our intercept's request-file writes happen
  // just before Stop fires. Give them a brief window to flush to disk. Without this
  // we occasionally miss the final assistant row (no final llm_request span) and
  // miss request files (no llm_request.captured marker).
  await delay(250)

  await withLock(() => {
    const key = stateKey(sessionId, transcriptPath)
    const prior = load(key)
    logger.debug(`prior offset=${prior.offset} turnCount=${prior.turnCount}`)

    const { rows, newOffset, newBuffer } = readIncremental(transcriptPath, prior.offset, prior.buffer)
    logger.debug(`read ${rows.length} rows; newOffset=${newOffset}`)

    if (rows.length === 0) {
      save(key, { ...prior, offset: newOffset, buffer: newBuffer })
      return
    }

    const turns = buildTurns(rows)
    logger.debug(`assembled ${turns.length} turn(s)`)
    if (turns.length === 0) {
      save(key, { ...prior, offset: newOffset, buffer: newBuffer })
      return
    }

    const subagentStates = stitchSubagents({
      sessionId,
      mainTranscriptPath: transcriptPath,
      turns,
      logger,
    })

    const context = collectTraceContext(payload)
    logger.debug(`context tags=${context.tags.length} metadata=${Object.keys(context.metadata).length}`)

    const allTurns = readAllTurns(transcriptPath)
    const conversationHistory = allTurns.slice(0, Math.max(0, allTurns.length - turns.length))
    logger.debug(`conversation history: ${conversationHistory.length} prior turn(s)`)

    const messageIds = collectMessageIds(turns)
    const requestsByMessageId = loadRequestsByMessageId(messageIds)
    logger.debug(`captured requests: ${requestsByMessageId.size}/${messageIds.length} messages`)
    if (requestsByMessageId.size < messageIds.length) {
      const missing = messageIds.filter((id) => !requestsByMessageId.has(id))
      logger.debug(`missing ${missing.length}: ${missing.join(", ")}`)
      logger.debug(`dir listing: ${listRequestFilenames().join(", ")}`)
    }

    const otlpRequest = buildOtlpRequest({
      sessionId,
      turnStartNumber: prior.turnCount + 1,
      turns,
      context,
      conversationHistory,
      requestsByMessageId,
    })

    return postTraces({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      project: config.project,
      payload: otlpRequest,
      logger,
    }).then(() => {
      save(key, {
        offset: newOffset,
        buffer: newBuffer,
        turnCount: prior.turnCount + turns.length,
      })
      for (const s of subagentStates) {
        save(s.key, { offset: s.newOffset, buffer: s.newBuffer, turnCount: s.turnCount })
      }
      // Prune the request files we just consumed, then sweep anything older than 24h.
      for (const id of requestsByMessageId.keys()) deleteRequest(id)
      const stalePruned = pruneStaleRequests()
      if (stalePruned > 0) logger.debug(`pruned ${stalePruned} stale request file(s)`)
    })
  })
}

function collectMessageIds(turns: Turn[]): string[] {
  const ids: string[] = []
  const visit = (ts: Turn[]) => {
    for (const turn of ts) {
      for (const call of turn.calls) {
        if (call.messageId && !call.messageId.startsWith("noid:")) ids.push(call.messageId)
      }
      for (const turn2 of ts) collectSubagentIds(turn2.calls, ids)
    }
  }
  visit(turns)
  return ids
}

function collectSubagentIds(calls: AssistantCall[], ids: string[]): void {
  for (const call of calls) {
    for (const tool of call.toolUses) {
      const sub = tool.subagent
      if (!sub) continue
      for (const subTurn of sub.turns) {
        for (const subCall of subTurn.calls) {
          if (subCall.messageId && !subCall.messageId.startsWith("noid:")) ids.push(subCall.messageId)
        }
        collectSubagentIds(subTurn.calls, ids)
      }
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function listRequestFilenames(): string[] {
  try {
    const dir = join(homedir(), ".claude", "state", "latitude", "requests")
    if (!existsSync(dir)) return []
    return readdirSync(dir)
  } catch {
    return []
  }
}

function materializeIntercept(logger: Logger): void {
  try {
    const src = fileURLToPath(new URL("./intercept.js", import.meta.url))
    if (!existsSync(src)) {
      logger.debug(`intercept: bundled file missing at ${src}`)
      return
    }
    mkdirSync(dirname(INTERCEPT_INSTALL_PATH), { recursive: true })
    if (!existsSync(INTERCEPT_INSTALL_PATH)) {
      copyFileSync(src, INTERCEPT_INSTALL_PATH)
      logger.debug(`intercept: installed to ${INTERCEPT_INSTALL_PATH}`)
      return
    }
    const srcStat = statSync(src)
    const dstStat = statSync(INTERCEPT_INSTALL_PATH)
    if (srcStat.mtimeMs > dstStat.mtimeMs || srcStat.size !== dstStat.size) {
      copyFileSync(src, INTERCEPT_INSTALL_PATH)
      logger.debug(`intercept: refreshed ${INTERCEPT_INSTALL_PATH}`)
    }
  } catch (err) {
    logger.debug(`intercept: materialize failed: ${String(err)}`)
  }
}

function runInstallPreload(): void {
  try {
    const src = fileURLToPath(new URL("./intercept.js", import.meta.url))
    if (!existsSync(src)) {
      process.stderr.write(`[latitude-claude-code] bundled intercept.js not found at ${src}\n`)
      process.exit(1)
    }
    mkdirSync(dirname(INTERCEPT_INSTALL_PATH), { recursive: true })
    copyFileSync(src, INTERCEPT_INSTALL_PATH)
    process.stdout.write(
      [
        `Installed intercept preload to: ${INTERCEPT_INSTALL_PATH}`,
        "",
        "Add this to ~/.claude/settings.json under `env`:",
        "",
        `  "BUN_OPTIONS": "--preload=${INTERCEPT_INSTALL_PATH}"`,
        "",
        "Then your Stop-hook spans will carry the full system prompt, tool definitions,",
        "and message body that hit the Anthropic API.",
        "",
      ].join("\n"),
    )
  } catch (err) {
    process.stderr.write(`[latitude-claude-code] install failed: ${String(err)}\n`)
    process.exit(1)
  }
}

interface SubagentReadResult {
  key: string
  newOffset: number
  newBuffer: string
  turnCount: number
}

function stitchSubagents(args: {
  sessionId: string
  mainTranscriptPath: string
  turns: Turn[]
  logger: Logger
}): SubagentReadResult[] {
  const { sessionId, mainTranscriptPath, turns, logger } = args
  const files = discoverSubagentFiles(mainTranscriptPath)
  if (files.length === 0) return []

  const agentCallsByPromptId = indexAgentCallsByPromptId(turns)
  if (agentCallsByPromptId.size === 0) {
    logger.debug(`found ${files.length} subagent file(s) but no Agent tool calls in new turns`)
    return []
  }

  const results: SubagentReadResult[] = []
  for (const file of files) {
    const key = stateKey(sessionId, file.filePath)
    const prior = load(key)
    const { rows, newOffset, newBuffer } = readIncremental(file.filePath, prior.offset, prior.buffer)
    if (rows.length === 0) continue

    const subTurns = buildTurns(rows, { includeSidechain: true })
    if (subTurns.length === 0) {
      results.push({ key, newOffset, newBuffer, turnCount: prior.turnCount })
      continue
    }

    attachSubagentTurns({
      file,
      rows,
      subTurns,
      agentCallsByPromptId,
      logger,
    })

    results.push({
      key,
      newOffset,
      newBuffer,
      turnCount: prior.turnCount + subTurns.length,
    })
  }
  return results
}

function indexAgentCallsByPromptId(turns: Turn[]): Map<string, ToolCall> {
  const map = new Map<string, ToolCall>()
  for (const turn of turns) {
    for (const assistantCall of turn.calls) {
      for (const toolCall of assistantCall.toolUses) {
        if (toolCall.name !== "Agent") continue
        if (!toolCall.promptId) continue
        map.set(toolCall.promptId, toolCall)
      }
    }
  }
  return map
}

function attachSubagentTurns(args: {
  file: SubagentFile
  rows: TranscriptRow[]
  subTurns: Turn[]
  agentCallsByPromptId: Map<string, ToolCall>
  logger: Logger
}): void {
  const { file, rows, subTurns, agentCallsByPromptId, logger } = args
  const promptId = firstPromptIdOf(rows)
  if (!promptId) {
    logger.debug(`subagent ${file.agentId}: no promptId in rows; skipping stitch`)
    return
  }
  const call = agentCallsByPromptId.get(promptId)
  if (!call) {
    logger.debug(`subagent ${file.agentId}: no matching Agent tool call for promptId=${promptId}`)
    return
  }
  const meta = readSubagentMeta(file.metaPath)
  call.subagent = {
    agentId: file.agentId,
    agentType: meta?.agentType ?? "unknown",
    description: meta?.description ?? "",
    turns: subTurns,
  }
  logger.debug(
    `subagent ${file.agentId}: attached ${subTurns.length} turn(s) to Agent call ${call.id} (${meta?.agentType ?? "unknown"})`,
  )
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`[latitude-claude-code] unexpected: ${String(err)}\n`)
    process.exit(0)
  })
