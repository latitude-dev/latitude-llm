import { postTraces } from "./client.ts"
import { loadConfig } from "./config.ts"
import { collectTraceContext } from "./context.ts"
import type { Logger } from "./logger.ts"
import { createLogger } from "./logger.ts"
import { buildOtlpRequest } from "./otlp.ts"
import { load, save, stateKey, withLock } from "./state.ts"
import {
  buildTurns,
  discoverSubagentFiles,
  firstPromptIdOf,
  readAllTurns,
  readIncremental,
  readSubagentMeta,
} from "./transcript.ts"
import type { HookPayload, SubagentFile, ToolCall, TranscriptRow, Turn } from "./types.ts"

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
  const config = loadConfig()
  const logger = createLogger(config.debug)

  if (!config.enabled) {
    if (config.apiKey === "") logger.debug("disabled: LATITUDE_API_KEY is empty")
    if (config.project === "") logger.debug("disabled: LATITUDE_PROJECT is empty")
    return
  }
  logger.debug(`enabled: project=${config.project} base=${config.baseUrl}`)

  const raw = await readStdin()
  const payload = parsePayload(raw)
  const { sessionId, transcriptPath } = pickSession(payload)
  if (!sessionId || !transcriptPath) {
    logger.debug(`missing session_id or transcript_path in hook payload (stdin was ${raw.length} bytes)`)
    return
  }
  logger.debug(`session=${sessionId} transcript=${transcriptPath}`)

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

    const otlpRequest = buildOtlpRequest({
      sessionId,
      turnStartNumber: prior.turnCount + 1,
      turns,
      context,
      conversationHistory,
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
    })
  })
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
