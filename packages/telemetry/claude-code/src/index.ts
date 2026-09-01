import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { postTraces } from "./client.ts"
import { loadConfig } from "./config.ts"
import { collectTraceContext } from "./context.ts"
import { detachSelf, isDetachedChild, readDetachedPayload } from "./detach.ts"
import {
  type InheritedContext,
  inheritedSessionId,
  MAX_INHERITED_SPANS,
  parseInheritedContext,
} from "./inherited-context.ts"
import type { Logger } from "./logger.ts"
import { createLogger } from "./logger.ts"
import { memoryProjectsRoot } from "./memory.ts"
import { buildOtlpRequest, buildSubagentSpans, chunkOtlpRequest } from "./otlp.ts"
import type { RedactConfig } from "./redaction.ts"
import { deleteRequest, loadRequestsByMessageId, pruneStaleRequests } from "./request-store.ts"
import { normalizeInstallFlags, parseFlags, runInstall, runUninstall } from "./setup.ts"
import { load, type SessionState, save, stateKey, withLock } from "./state.ts"
import {
  buildTurns,
  discoverSubagentFiles,
  firstPromptIdOf,
  readAllRows,
  readAllTurns,
  readIncremental,
  readSubagentMeta,
} from "./transcript.ts"
import type {
  AgentSpanLink,
  HookPayload,
  MemoryEmitOptions,
  OtlpSpan,
  SubagentInvocation,
  TraceContext,
  Turn,
} from "./types.ts"

type AgentLinkMap = Record<string, { traceId: string; parentSpanId: string }>

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
  const { subcommand, flags } = parseFlags(process.argv.slice(2))
  if (subcommand === "install" || subcommand === "install-preload") {
    await runInstall(normalizeInstallFlags(flags))
    return
  }
  if (subcommand === "uninstall") {
    await runUninstall({ noPrompt: flags["no-prompt"] === true || flags.yes === true })
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

  const detachedChild = isDetachedChild()
  const raw = detachedChild ? readDetachedPayload() : await readStdin()
  // Hand the work to a process that outlives this session, then exit. Everything
  // below runs in the detached child.
  if (!detachedChild && detachSelf(raw, logger)) return

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

  await withLock(
    () => {
      const key = stateKey(sessionId, transcriptPath)
      const prior = load(key)
      logger.debug(`prior offset=${prior.offset} turnCount=${prior.turnCount}`)

      const context = collectTraceContext(payload)
      logger.debug(`context tags=${context.tags.length} metadata=${Object.keys(context.metadata).length}`)

      // `sessionId` still keys all local state — only what spans report changes — so a
      // resumed session keeps its transcript offsets when a session id is inherited.
      const inherited = resolveInherited(prior, logger)
      // Read on its own: past the join cap the session stops joining the trace but
      // stays grouped by the shared session id.
      const reportedSessionId = inheritedSessionId() ?? sessionId
      if (reportedSessionId !== sessionId) context.metadata["claude_code.session.id"] = sessionId
      if (inherited) {
        context.metadata["latitude.parent.trace_id"] = inherited.traceId
        context.metadata["latitude.parent.span_id"] = inherited.parentSpanId
      }

      const memory: MemoryEmitOptions | undefined = config.memory
        ? { projectsRoot: memoryProjectsRoot(transcriptPath), captureContent: config.memoryContent }
        : undefined

      const { rows, newOffset, newBuffer } = readIncremental(transcriptPath, prior.offset, prior.buffer)
      const turns = buildTurns(rows)
      logger.debug(`read ${rows.length} row(s); ${turns.length} new turn(s); newOffset=${newOffset}`)

      const allTurns = readAllTurns(transcriptPath)
      const conversationHistory =
        turns.length > 0 ? allTurns.slice(0, Math.max(0, allTurns.length - turns.length)) : allTurns

      // Main-turn spans, capturing a link (traceId + tool span id) for every parent
      // Agent tool call so subagents can attach under it — this turn or a later one.
      const mainMessageIds = collectCallMessageIds(turns)
      const mainRequests = loadRequestsByMessageId(mainMessageIds)
      const agentLinks: AgentSpanLink[] = []
      const otlpRequest = buildOtlpRequest({
        sessionId: reportedSessionId,
        localSessionId: sessionId,
        inherited,
        turnStartNumber: prior.turnCount + 1,
        turns,
        context,
        conversationHistory,
        requestsByMessageId: mainRequests,
        redact: config.redact,
        agentLinks,
        memory,
      })

      const linkMap: AgentLinkMap = { ...(prior.agentLinks ?? {}) }
      for (const link of agentLinks) {
        const target = { traceId: link.traceId, parentSpanId: link.parentSpanId }
        linkMap[link.toolUseId] = target
        if (link.promptId) linkMap[link.promptId] = target
      }

      // Subagents run in their own transcript files and typically finish flushing
      // after the parent turn was already shipped (the final synthesis lands last).
      // Re-emit each subagent's whole subtree whenever its file has grown since the
      // last emission — idempotent, because span ids and start times are stable.
      const subagents = emitSubagents({
        sessionId: reportedSessionId,
        stateSessionId: sessionId,
        mainTranscriptPath: transcriptPath,
        linkMap,
        context,
        redact: config.redact,
        memory,
        logger,
      })

      const scope = otlpRequest.resourceSpans[0]?.scopeSpans[0]
      if (scope) scope.spans.push(...subagents.spans)
      const spanCount = scope?.spans.length ?? 0

      if (spanCount === 0) {
        save(key, { ...prior, offset: newOffset, buffer: newBuffer, agentLinks: linkMap })
        return
      }

      // Long agentic turns produce payloads far beyond what a single POST can deliver,
      // so the batch ships as size-bounded chunks. The offset only advances after every
      // chunk lands — on any failure the whole batch is retried on the next Stop, and
      // deterministic span IDs make the re-send idempotent server-side.
      const chunks = chunkOtlpRequest(otlpRequest)
      if (chunks.length > 1) logger.debug(`payload split into ${chunks.length} chunks`)

      return (async () => {
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          if (!chunk) continue
          const ok = await postTraces({
            baseUrl: config.baseUrl,
            apiKey: config.apiKey,
            project: config.project,
            payload: chunk,
            logger,
          })
          if (!ok) {
            logger.warn(`chunk ${i + 1}/${chunks.length} failed; keeping offset so the next Stop retries this batch`)
            return
          }
        }

        save(key, {
          offset: newOffset,
          buffer: newBuffer,
          turnCount: prior.turnCount + turns.length,
          agentLinks: linkMap,
          // Kept when `inherited` is undefined: dropping it would reset the ceiling
          // count and let a capped session immediately rejoin the trace it just left.
          inheritedTraceId: inherited?.traceId ?? prior.inheritedTraceId,
          inheritedSpanCount: inherited
            ? (prior.inheritedTraceId === inherited.traceId ? (prior.inheritedSpanCount ?? 0) : 0) + spanCount
            : prior.inheritedSpanCount,
        })
        for (const s of subagents.saves) {
          save(s.key, { offset: 0, buffer: "", turnCount: 0, ...s.state })
        }
        // Prune the main request files we just consumed, then sweep anything older
        // than 24h. Subagent request files are left for the 24h sweep so a later
        // re-emission can still recover their captured payloads.
        for (const id of mainMessageIds) deleteRequest(id)
        const stalePruned = pruneStaleRequests()
        if (stalePruned > 0) logger.debug(`pruned ${stalePruned} stale request file(s)`)
      })()
    },
    () => logger.debug("another hook run owns the session state; it will ship this window"),
  )
}

// Joining stops once this session has pushed MAX_INHERITED_SPANS into a trace it
// does not own; later turns fall back to their own per-turn traces and stay grouped
// by the shared session id alone.
function resolveInherited(prior: SessionState, logger: Logger): InheritedContext | undefined {
  const inherited = parseInheritedContext()
  if (!inherited) return undefined
  const contributed = prior.inheritedTraceId === inherited.traceId ? (prior.inheritedSpanCount ?? 0) : 0
  if (contributed >= MAX_INHERITED_SPANS) {
    logger.debug(`inherited trace ${inherited.traceId} at ${contributed} spans; emitting own traces from here`)
    return undefined
  }
  logger.debug(`joining inherited trace ${inherited.traceId} under span ${inherited.parentSpanId}`)
  return inherited
}

function collectCallMessageIds(turns: Turn[]): string[] {
  const ids = new Set<string>()
  for (const turn of turns) {
    for (const call of turn.calls) {
      if (call.messageId && !call.messageId.startsWith("noid:")) ids.add(call.messageId)
    }
  }
  return Array.from(ids)
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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

interface SubagentSave {
  emittedCalls: number
  interactionEmitted: boolean
  lastSize: number
  subDone: boolean
}

interface SubagentEmission {
  spans: OtlpSpan[]
  saves: Array<{ key: string; state: SubagentSave }>
}

function emitSubagents(args: {
  sessionId: string
  // Claude's own session id, which keys the per-subagent state. It diverges from
  // `sessionId` (what spans report) whenever an inherited session id is in play.
  stateSessionId: string
  mainTranscriptPath: string
  linkMap: AgentLinkMap
  context: TraceContext
  redact?: RedactConfig | undefined
  memory?: MemoryEmitOptions | undefined
  logger: Logger
}): SubagentEmission {
  const { sessionId, stateSessionId, mainTranscriptPath, linkMap, context, redact, memory, logger } = args
  const spans: OtlpSpan[] = []
  const saves: Array<{ key: string; state: SubagentSave }> = []

  for (const file of discoverSubagentFiles(mainTranscriptPath)) {
    let size: number
    try {
      size = statSync(file.filePath).size
    } catch {
      continue
    }
    if (size === 0) continue

    const subKey = stateKey(stateSessionId, file.filePath)
    const prior = load(subKey)
    if (prior.subDone && size === prior.lastSize) continue

    const meta = readSubagentMeta(file.metaPath)
    const rows = readAllRows(file.filePath)
    const promptId = firstPromptIdOf(rows)
    const link = (meta?.toolUseId ? linkMap[meta.toolUseId] : undefined) ?? (promptId ? linkMap[promptId] : undefined)
    if (!link) {
      logger.debug(`subagent ${file.agentId}: parent Agent link not seen yet (toolUseId=${meta?.toolUseId ?? "none"})`)
      continue
    }

    const subTurns = buildTurns(rows, { includeSidechain: true })
    if (subTurns.length === 0) continue
    const totalCalls = subTurns.reduce((sum, t) => sum + t.calls.length, 0)

    // A call is safe to emit once it is closed by a later call. The trailing call
    // (and the interaction span's final duration) only settle once the transcript
    // stops growing, so hold it until the file size is unchanged from the last Stop.
    const stable = prior.lastSize !== undefined && size === prior.lastSize
    const emittedCalls = prior.emittedCalls ?? 0
    const targetCalls = stable ? totalCalls : Math.max(0, totalCalls - 1)
    const emitInteraction = !(prior.interactionEmitted ?? false)

    if (targetCalls <= emittedCalls && !emitInteraction) {
      saves.push({
        key: subKey,
        state: {
          emittedCalls,
          interactionEmitted: prior.interactionEmitted ?? false,
          lastSize: size,
          subDone: stable && emittedCalls >= totalCalls,
        },
      })
      continue
    }

    const subagent: SubagentInvocation = {
      agentId: file.agentId,
      agentType: meta?.agentType ?? "unknown",
      description: meta?.description ?? "",
      turns: subTurns,
    }
    const requestsByMessageId = loadRequestsByMessageId(collectCallMessageIds(subTurns))
    spans.push(
      ...buildSubagentSpans({
        sessionId,
        traceId: link.traceId,
        parentSpanId: link.parentSpanId,
        subagent,
        emitInteraction,
        fromCall: emittedCalls,
        toCall: targetCalls,
        context,
        requestsByMessageId,
        redact,
        memory,
      }),
    )
    saves.push({
      key: subKey,
      state: {
        emittedCalls: targetCalls,
        interactionEmitted: true,
        lastSize: size,
        subDone: stable && targetCalls >= totalCalls,
      },
    })
    logger.debug(
      `subagent ${file.agentId}: emitted calls [${emittedCalls}, ${targetCalls}) interaction=${emitInteraction} stable=${stable}`,
    )
  }

  return { spans, saves }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    process.stderr.write(`[latitude-claude-code] unexpected: ${String(err)}\n`)
    process.exit(0)
  })
