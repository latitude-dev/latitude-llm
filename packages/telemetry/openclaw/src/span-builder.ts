import { createHash, randomUUID } from "node:crypto"
import { type CronJob, cronJobFromSessionKey, deriveEnrichment, type Sender, senderFromPrompt } from "./context.ts"
import {
  agentDatabasePath,
  type CompactionRecord,
  readLatestCompaction,
  readLatestCompactionFromFile,
  readSessionTranscript,
  readSessionTranscriptFromDatabase,
  SessionHistoryStore,
  sessionTranscriptPath,
  stateDirFromWorkspace,
  type TranscriptReader,
  type TranscriptRowsReader,
  withoutCurrentPrompt,
} from "./history.ts"
import { type FileReader, type MemoryEvent, memoryEventsFromToolCall, memorySnapshot } from "./memory.ts"
import {
  type Message,
  normalizeMessage,
  normalizeMessages,
  systemInstructionsParts,
  userMessageFromPrompt,
} from "./messages.ts"
import { type ToolDefinition, toolDefinitionsFrom } from "./tools.ts"
import type {
  OpenClawAfterCompactionEvent,
  OpenClawAfterToolCallEvent,
  OpenClawAgentContext,
  OpenClawAgentEndEvent,
  OpenClawBeforeCompactionEvent,
  OpenClawBeforeToolCallEvent,
  OpenClawCronChangedEvent,
  OpenClawLlmInputEvent,
  OpenClawLlmOutputEvent,
  OpenClawMessageContext,
  OpenClawMessageReceivedEvent,
  OpenClawModelCallEndedEvent,
  OpenClawModelCallStartedEvent,
  OpenClawSessionScopedContext,
  OpenClawSessionStartEvent,
  OpenClawSubagentContext,
  OpenClawSubagentEndedEvent,
  OpenClawSubagentSpawnedEvent,
  OpenClawToolContext,
} from "./types.ts"
import {
  type AttrInput,
  type AttrValue,
  finishReason,
  isTranscriptAssistant,
  type TranscriptAssistant,
  type TranscriptUsage,
  usageAttrsFromAggregate,
  usageAttrsFromTranscript,
} from "./usage.ts"

export type { AttrValue } from "./usage.ts"

/**
 * Builds one trace per OpenClaw agent run from the typed plugin hooks:
 *
 *   interaction (root, invoke_agent)
 *   ├── search_memory        (once per session: the snapshot injected at session start)
 *   ├── llm_request          (chat; one per provider call, per-call usage + cost + messages)
 *   ├── tool_call:<name>     (execute_tool; sibling of llm_request, tools run between calls)
 *   │   └── search_memory / upsert_memory / delete_memory   (memory tools and memory file writes)
 *   ├── tool_call:sessions_spawn
 *   │   └── subagent         (spawn → ended; the child run's interaction nests underneath)
 *   ├── compaction
 *   └── llm_request
 *
 * No hook announces a run before `llm_input`, so the root opens lazily on the
 * first event that carries a run id. `agent_end` carries the whole transcript,
 * which is where per-call usage, cost and output content come from; it fires
 * before `llm_output`, so finalization waits for the latter or a short grace.
 */

export interface SpanRecord {
  spanId: string
  traceId: string
  parentSpanId: string
  name: string
  /** OTel SpanKind: 1 INTERNAL, 3 CLIENT. */
  kind: number
  startMs: number
  endMs: number | undefined
  attrs: Record<string, AttrValue>
  outcome?: "ok" | "error"
  errorMessage?: string | undefined
}

export interface BuildResult {
  runId: string
  spans: SpanRecord[]
}

interface SpanBuilderOptions {
  emit: (result: BuildResult) => void
  pluginVersion: string
  tags?: readonly string[]
  metadata?: Readonly<Record<string, string>>
  memory?: boolean
  memoryContent?: boolean
  toolDefinitions?: boolean
  now?: (() => number) | undefined
  schedule?: ((fn: () => void, ms: number) => () => void) | undefined
  readFile?: FileReader | undefined
  readTranscript?: TranscriptReader | undefined
  readTranscriptRows?: TranscriptRowsReader | undefined
  /** OpenClaw's state dir, when the host exposes it; otherwise derived from the workspace dir. */
  stateDir?: string | undefined
  log?: ((msg: string) => void) | undefined
}

interface RunState {
  runId: string
  ctx: OpenClawAgentContext
  traceId: string
  root: SpanRecord
  startedAt: number
  history: Message[]
  inputMessages: Message[]
  /** History rebuilt by the plugin when the harness passed none; prepended to every input. */
  inheritedHistory: Message[]
  historySource: "harness" | "memory" | "sqlite" | "file" | "none"
  /** Timestamps of streamed assistant/thinking deltas, for time to first token. */
  deltas: number[]
  /** Streamed reasoning text, for harnesses whose transcript omits it. */
  thinking: Array<{ ts: number; text: string }>
  thinkingChars: number
  prompt: string | undefined
  systemPrompt: string | undefined
  toolDefinitions: ToolDefinition[] | undefined
  llmCalls: SpanRecord[]
  openModelCalls: Map<string, SpanRecord>
  openToolCalls: Map<string, SpanRecord>
  openCompaction: SpanRecord | undefined
  closed: SpanRecord[]
  lastSpawnToolSpanId: string | undefined
  subagentIds: string[]
  sender: Sender | undefined
  cron: CronJob | undefined
  link: SubagentLink | undefined
  aggregateUsage: AttrInput
  output:
    | {
        resolvedRef?: string | undefined
        harnessId?: string | undefined
        reasoningEffort?: string | undefined
        lastAssistant?: unknown
      }
    | undefined
  endEvent: OpenClawAgentEndEvent | undefined
  outputSeen: boolean
  finalized: boolean
  cancelGrace: (() => void) | undefined
}

interface SubagentLink {
  traceId: string
  parentSpanId: string
  parentRunId: string
  sessionId: string | undefined
  agentName: string | undefined
  createdAt: number
}

interface PendingSubagent {
  span: SpanRecord
  parentRunId: string
  createdAt: number
}

const GRACE_MS = 1500
const RUN_TTL_MS = 2 * 60 * 60 * 1000
const LINK_TTL_MS = 60 * 60 * 1000
const LINK_MAX = 1000
const SESSION_INDEX_MAX = 2000
const STANDALONE_COMPACTION_MAX = 100
const SPAWN_TOOL_PATTERN = /spawn/i
const MAX_DELTAS = 256
const MAX_THINKING_CHARS = 64 * 1024
const KIND_INTERNAL = 1
const KIND_CLIENT = 3

export class SpanBuilder {
  private readonly runs = new Map<string, RunState>()
  private readonly runsBySession = new Map<string, string[]>()
  private readonly subagentLinks = new Map<string, SubagentLink>()
  private readonly pendingSubagents = new Map<string, PendingSubagent>()
  private readonly sessionIds = new Map<string, string>()
  private readonly modelBySession = new Map<string, { provider: string; model: string }>()
  private readonly workspaceBySession = new Map<string, string>()
  private readonly memorySnapshotSessions = new Set<string>()
  private readonly senders = new Map<string, Map<string, Sender>>()
  private readonly sendersById = new Map<string, Sender>()
  private readonly cronStarted = new Map<string, CronJob>()
  private readonly sessionHistory: SessionHistoryStore
  private readonly standaloneCompactions = new Map<string, SpanRecord>()
  private readonly emit: (result: BuildResult) => void
  private readonly now: () => number
  private readonly schedule: (fn: () => void, ms: number) => () => void
  private readonly readFile: FileReader | undefined
  private readonly readTranscript: TranscriptReader | undefined
  private readonly readTranscriptRows: TranscriptRowsReader | undefined
  private readonly stateDir: string | undefined
  private readonly log: (msg: string) => void
  private readonly pluginVersion: string
  private readonly operatorTags: readonly string[]
  private readonly operatorMetadata: Readonly<Record<string, string>>
  private readonly memoryEnabled: boolean
  private readonly memoryContent: boolean
  private readonly toolDefinitionsEnabled: boolean

  constructor(options: SpanBuilderOptions) {
    this.emit = options.emit
    this.now = options.now ?? (() => Date.now())
    this.schedule =
      options.schedule ??
      ((fn, ms) => {
        const timer = setTimeout(fn, ms)
        timer.unref?.()
        return () => clearTimeout(timer)
      })
    this.readFile = options.readFile
    this.readTranscript = options.readTranscript
    this.readTranscriptRows = options.readTranscriptRows
    this.stateDir = options.stateDir
    this.sessionHistory = new SessionHistoryStore(this.now)
    this.log = options.log ?? (() => {})
    this.pluginVersion = options.pluginVersion
    this.operatorTags = options.tags ?? []
    this.operatorMetadata = options.metadata ?? {}
    this.memoryEnabled = options.memory ?? true
    this.memoryContent = options.memoryContent ?? true
    this.toolDefinitionsEnabled = options.toolDefinitions ?? true
  }

  inflightCount(): number {
    return this.runs.size
  }

  subagentLinkCount(): number {
    return this.subagentLinks.size
  }

  // ─── Run lifecycle ────────────────────────────────────────────────────────

  onLlmInput(evt: OpenClawLlmInputEvent, ctx: OpenClawAgentContext): void {
    const run = this.ensureRun(evt.runId, ctx)
    if (!run) return
    const harnessHistory = normalizeMessages(evt.historyMessages)
    if (harnessHistory.length > 0) {
      run.inheritedHistory = []
      run.historySource = "harness"
    } else {
      this.inheritHistory(run, evt.prompt)
    }
    run.history = [...run.inheritedHistory, ...harnessHistory]
    if (evt.prompt) run.history.push(userMessageFromPrompt(evt.prompt))
    run.inputMessages = [...run.history]
    run.prompt = evt.prompt
    run.systemPrompt = evt.systemPrompt
    if (run.ctx.sessionKey) {
      remember(this.modelBySession, run.ctx.sessionKey, { provider: evt.provider, model: evt.model }, SESSION_INDEX_MAX)
      if (run.ctx.workspaceDir) {
        remember(this.workspaceBySession, run.ctx.sessionKey, run.ctx.workspaceDir, SESSION_INDEX_MAX)
      }
    }
    if (this.toolDefinitionsEnabled) run.toolDefinitions = toolDefinitionsFrom(evt.tools) ?? run.toolDefinitions
    Object.assign(run.root.attrs, {
      "gen_ai.request.model": evt.model,
      "openclaw.provider": evt.provider,
      "openclaw.images.count": evt.imagesCount,
      "openclaw.tool_count": evt.tools?.length,
    })
    this.recordMemorySnapshot(run)
  }

  onLlmOutput(evt: OpenClawLlmOutputEvent, ctx: OpenClawAgentContext): void {
    const run = this.runs.get(ctx.runId ?? evt.runId)
    if (!run) return
    this.mergeCtx(run, ctx)
    run.outputSeen = true
    run.aggregateUsage = usageAttrsFromAggregate(evt.usage)
    run.output = {
      resolvedRef: evt.resolvedRef,
      harnessId: evt.harnessId,
      reasoningEffort: evt.reasoningEffort,
      lastAssistant: evt.lastAssistant,
    }
    Object.assign(run.root.attrs, {
      "gen_ai.response.model": evt.model,
      "openclaw.resolved.ref": evt.resolvedRef,
      "openclaw.harness.id": evt.harnessId,
      "openclaw.reasoning.effort": evt.reasoningEffort,
    })
    if (run.endEvent) this.finalize(run)
  }

  onAgentEnd(evt: OpenClawAgentEndEvent, ctx: OpenClawAgentContext): void {
    const runId = ctx.runId ?? evt.runId
    if (!runId) return
    const run = this.runs.get(runId)
    if (!run) {
      this.subagentLinks.delete(runId)
      return
    }
    this.mergeCtx(run, ctx)
    run.endEvent = evt
    if (run.outputSeen) {
      this.finalize(run)
      return
    }
    run.cancelGrace = this.schedule(() => this.finalize(run), GRACE_MS)
  }

  // ─── Model calls ──────────────────────────────────────────────────────────

  onModelCallStarted(evt: OpenClawModelCallStartedEvent, ctx: OpenClawAgentContext): void {
    const run = this.ensureRun(evt.runId, {
      ...ctx,
      sessionId: ctx.sessionId ?? evt.sessionId,
      sessionKey: ctx.sessionKey ?? evt.sessionKey,
    })
    if (!run) return
    const span: SpanRecord = {
      spanId: hashHex(`${run.runId}:llm_request:${evt.callId}`, 16),
      traceId: run.traceId,
      parentSpanId: run.root.spanId,
      name: "llm_request",
      kind: KIND_INTERNAL,
      startMs: this.now(),
      endMs: undefined,
      attrs: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": evt.provider,
        "gen_ai.system": evt.provider,
        "gen_ai.request.model": evt.model,
        "gen_ai.request.stream": true,
        "openclaw.call.id": evt.callId,
        "openclaw.api": evt.api,
        "openclaw.transport": evt.transport,
        "openclaw.context.token_budget": evt.contextTokenBudget,
        "llm_request.call_index": run.llmCalls.length + run.openModelCalls.size,
        "gen_ai.input.messages:gated": [...run.history],
        "gen_ai.system_instructions:gated": run.systemPrompt ? systemInstructionsParts(run.systemPrompt) : undefined,
        "gen_ai.tool.definitions:gated": run.toolDefinitions,
      },
    }
    run.openModelCalls.set(evt.callId, span)
  }

  onModelCallEnded(evt: OpenClawModelCallEndedEvent, _ctx: OpenClawAgentContext): void {
    const run = this.runs.get(evt.runId)
    if (!run) return
    const span = run.openModelCalls.get(evt.callId)
    if (!span) return
    span.endMs = this.now()
    span.outcome = evt.outcome === "completed" ? "ok" : "error"
    span.errorMessage = evt.errorCategory
    Object.assign(span.attrs, {
      "openclaw.duration_ms": evt.durationMs,
      "openclaw.outcome": evt.outcome,
      "openclaw.error.category": evt.errorCategory,
      "openclaw.failure.kind": evt.failureKind,
      "error.type": evt.outcome === "error" ? (evt.errorCategory ?? evt.failureKind ?? "error") : undefined,
      "openclaw.request.payload_bytes": evt.requestPayloadBytes,
      "openclaw.response.stream_bytes": evt.responseStreamBytes,
      "openclaw.ttfb_ms": evt.timeToFirstByteMs,
      "gen_ai.server.time_to_first_token":
        evt.timeToFirstByteMs !== undefined && evt.timeToFirstByteMs > 0
          ? Math.round(evt.timeToFirstByteMs * 1_000_000)
          : undefined,
      "openclaw.upstream.request_id_hash": evt.upstreamRequestIdHash,
    })
    run.openModelCalls.delete(evt.callId)
    run.llmCalls.push(span)
  }

  // ─── Tools ────────────────────────────────────────────────────────────────

  onBeforeToolCall(evt: OpenClawBeforeToolCallEvent, ctx: OpenClawToolContext): void {
    const runId = evt.runId ?? ctx.runId
    if (!runId) return
    const run = this.ensureRun(runId, toolCtxToAgentCtx(ctx, runId))
    if (!run) return
    const toolCallId = evt.toolCallId ?? ctx.toolCallId ?? `${evt.toolName}:${randomUUID()}`
    const span: SpanRecord = {
      spanId: hashHex(`${run.runId}:tool_call:${toolCallId}`, 16),
      traceId: run.traceId,
      parentSpanId: run.root.spanId,
      name: `tool_call:${evt.toolName}`,
      kind: KIND_CLIENT,
      startMs: this.now(),
      endMs: undefined,
      attrs: {
        "gen_ai.operation.name": "execute_tool",
        "gen_ai.tool.name": evt.toolName,
        "gen_ai.tool.call.id": toolCallId,
        "gen_ai.tool.call.arguments:gated": evt.params,
      },
    }
    run.openToolCalls.set(toolCallId, span)
    run.history.push({
      role: "assistant",
      parts: [{ type: "tool_call", id: toolCallId, name: evt.toolName, arguments: evt.params }],
    })
    if (SPAWN_TOOL_PATTERN.test(evt.toolName)) run.lastSpawnToolSpanId = span.spanId
  }

  onAfterToolCall(evt: OpenClawAfterToolCallEvent, ctx: OpenClawToolContext): void {
    const runId = evt.runId ?? ctx.runId
    if (!runId) return
    const run = this.runs.get(runId)
    if (!run) return
    let resolvedId = evt.toolCallId && run.openToolCalls.has(evt.toolCallId) ? evt.toolCallId : undefined
    if (!resolvedId) resolvedId = this.findOpenToolCallByName(run, evt.toolName)
    if (!resolvedId) return
    const span = run.openToolCalls.get(resolvedId)
    if (!span) return

    span.endMs = this.now()
    const isError = Boolean(evt.error)
    span.outcome = isError ? "error" : "ok"
    span.errorMessage = evt.error
    Object.assign(span.attrs, {
      "gen_ai.tool.call.result:gated": evt.result,
      "tool.is_error": isError,
      "error.type": isError ? "tool_error" : undefined,
      "error.message:gated": evt.error,
      "openclaw.duration_ms": evt.durationMs,
    })
    run.openToolCalls.delete(resolvedId)
    run.closed.push(span)
    run.history.push({
      role: "tool",
      parts: [
        { type: "tool_call_response", id: resolvedId, name: evt.toolName, response: evt.result ?? evt.error ?? "" },
      ],
    })

    if (this.memoryEnabled) {
      const events = memoryEventsFromToolCall(
        {
          toolName: evt.toolName,
          params: evt.params,
          result: evt.result,
          error: evt.error,
          workspaceDir: run.ctx.workspaceDir,
          agentId: run.ctx.agentId,
        },
        this.readFile,
      )
      for (const memory of events) run.closed.push(this.memorySpan(run, memory, span))
    }
  }

  // ─── Compaction (keyed by session, no run id on the hook) ─────────────────

  /**
   * A compaction is a model call of its own: the compacted messages go in and
   * a summary comes out, so it is exported as a `chat` span. OpenClaw fires no
   * per-call hooks for the summarizer, so its usage is unreported.
   */
  onBeforeCompaction(evt: OpenClawBeforeCompactionEvent, ctx: OpenClawSessionScopedContext): void {
    const run = this.openRunForSession(ctx.sessionKey)
    const startMs = this.now()
    const traceId = run?.traceId ?? hashHex(`${ctx.sessionKey ?? "unknown"}:compaction:${startMs}`, 32)
    const model = ctx.sessionKey ? this.modelBySession.get(ctx.sessionKey) : undefined
    const span: SpanRecord = {
      spanId: hashHex(`${traceId}:compaction:${startMs}`, 16),
      traceId,
      parentSpanId: run?.root.spanId ?? "",
      name: "compaction",
      kind: KIND_INTERNAL,
      startMs,
      endMs: undefined,
      attrs: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": model?.provider,
        "gen_ai.system": model?.provider,
        "gen_ai.request.model": model?.model,
        "openclaw.usage.state": "unreported",
        "openclaw.compaction.message_count.before": evt.messageCount,
        "openclaw.compaction.compacting_count": evt.compactingCount,
        "openclaw.compaction.token_count.before": evt.tokenCount,
        "openclaw.compaction.session_file": evt.sessionFile,
        "openclaw.session.key": ctx.sessionKey,
        "gen_ai.input.messages:gated": evt.messages ? normalizeMessages(evt.messages) : undefined,
      },
    }
    if (run) {
      run.openCompaction = span
      return
    }
    remember(this.standaloneCompactions, ctx.sessionKey ?? "", span, STANDALONE_COMPACTION_MAX)
  }

  onAfterCompaction(evt: OpenClawAfterCompactionEvent, ctx: OpenClawSessionScopedContext): void {
    const run = this.openRunForSession(ctx.sessionKey)
    const span = run?.openCompaction ?? this.standaloneCompactions.get(ctx.sessionKey ?? "")
    if (!span) return
    const endMs = this.now()
    span.endMs = endMs
    span.outcome = "ok"
    const sessionId =
      ctx.sessionId ?? run?.ctx.sessionId ?? (ctx.sessionKey ? this.sessionIds.get(ctx.sessionKey) : undefined)
    const agentId = ctx.agentId ?? run?.ctx.agentId ?? agentIdFromSessionKey(ctx.sessionKey)
    const workspaceDir =
      run?.ctx.workspaceDir ?? (ctx.sessionKey ? this.workspaceBySession.get(ctx.sessionKey) : undefined)
    const record = this.latestCompaction(sessionId, agentId, workspaceDir)
    Object.assign(span.attrs, {
      "openclaw.compaction.message_count.after": evt.messageCount,
      "openclaw.compaction.compacted_count": evt.compactedCount,
      "openclaw.compaction.token_count.after": evt.tokenCount ?? record?.tokensAfter,
      "openclaw.compaction.token_count.before":
        span.attrs["openclaw.compaction.token_count.before"] ?? record?.tokensBefore,
      "openclaw.compaction.previous_session_id": evt.previousSessionId,
      "openclaw.compaction.summary_chars": record?.summary.length,
      "gen_ai.output.messages:gated": record
        ? [{ role: "assistant", parts: [{ type: "text", content: record.summary }] }]
        : undefined,
    })
    if (run?.openCompaction === span) {
      run.openCompaction = undefined
      run.closed.push(span)
      return
    }
    this.standaloneCompactions.delete(ctx.sessionKey ?? "")

    const runCtx: OpenClawAgentContext = { agentId, sessionKey: ctx.sessionKey, sessionId, workspaceDir }
    const enrichment = deriveEnrichment(
      { ctx: runCtx, subagentIds: [], pluginVersion: this.pluginVersion },
      { tags: this.operatorTags, metadata: this.operatorMetadata },
    )
    const compacted = evt.compactedCount ?? 0
    const root: SpanRecord = {
      spanId: hashHex(`${span.traceId}:compaction-root`, 16),
      traceId: span.traceId,
      parentSpanId: "",
      name: "compaction",
      kind: KIND_INTERNAL,
      startMs: span.startMs,
      endMs,
      outcome: "ok",
      attrs: {
        "gen_ai.operation.name": "invoke_agent",
        "interaction.kind": "compaction",
        "interaction.duration_ms": endMs - span.startMs,
        "user_prompt:gated": `[compaction] ${compacted} messages summarized, ${evt.messageCount} kept`,
        "gen_ai.output.messages:gated": span.attrs["gen_ai.output.messages:gated"],
        "openclaw.outcome": "completed",
        "openclaw.llm_calls": 1,
        "openclaw.tool_calls": 0,
      },
    }
    span.parentSpanId = root.spanId
    const common: AttrInput = {
      ...sessionAttrs(sessionId),
      "openclaw.session.id": sessionId,
      "openclaw.session.key": ctx.sessionKey,
      "openclaw.agent.id": agentId,
      "gen_ai.agent.name": agentId,
      "openclaw.workspace.dir": workspaceDir,
      "latitude.tags": enrichment.tags,
      "latitude.metadata": enrichment.metadata,
    }
    for (const target of [root, span]) {
      for (const [k, v] of Object.entries(common)) {
        if (target.attrs[k] === undefined) target.attrs[k] = v
      }
    }
    this.emit({ runId: `compaction:${span.spanId}`, spans: [root, span] })
  }

  private latestCompaction(
    sessionId: string | undefined,
    agentId: string | undefined,
    workspaceDir: string | undefined,
  ): CompactionRecord | undefined {
    const stateDir = this.stateDir ?? stateDirFromWorkspace(workspaceDir)
    if (!sessionId || !agentId || !stateDir) return undefined
    return (
      readLatestCompaction(agentDatabasePath(stateDir, agentId), sessionId, this.readTranscriptRows) ??
      readLatestCompactionFromFile(sessionTranscriptPath(stateDir, agentId, sessionId), this.readTranscript)
    )
  }

  // ─── Sessions, senders, cron ──────────────────────────────────────────────

  onSessionStart(evt: OpenClawSessionStartEvent, _ctx: OpenClawSessionScopedContext): void {
    if (evt.sessionKey) {
      remember(this.sessionIds, evt.sessionKey, evt.sessionId, SESSION_INDEX_MAX)
      this.memorySnapshotSessions.delete(evt.sessionKey)
    }
  }

  onSessionEnd(sessionKey: string | undefined, sessionId?: string): void {
    if (sessionId) this.sessionHistory.forget(sessionId)
    if (!sessionKey) return
    this.memorySnapshotSessions.delete(sessionKey)
    this.senders.delete(sessionKey)
  }

  onMessageReceived(evt: OpenClawMessageReceivedEvent, ctx: OpenClawMessageContext): void {
    const sessionKey = evt.sessionKey ?? ctx.sessionKey
    const id = evt.senderId ?? evt.metadata?.senderId ?? ctx.senderId
    if (!sessionKey || !id) return
    let bySender = this.senders.get(sessionKey)
    if (!bySender) {
      bySender = new Map()
      this.senders.set(sessionKey, bySender)
    }
    const sender = { id, name: evt.metadata?.senderName, username: evt.metadata?.senderUsername }
    bySender.set(id, sender)
    if (sender.name || sender.username) this.sendersById.set(id, sender)
  }

  /**
   * Streamed agent events: `lifecycle` start gives the run's true start before
   * any hook fires, and the first `assistant` / `thinking` delta after a model
   * call started is its time to first token, which the Codex harness reports
   * nowhere else.
   */
  onAgentEvent(evt: {
    runId?: string
    stream?: string
    ts?: number
    data?: Record<string, unknown>
    sessionKey?: string
    sessionId?: string
    agentId?: string
  }): void {
    if (!evt.runId || !evt.stream) return
    if (evt.stream === "lifecycle") {
      if (evt.data?.phase !== "start") return
      const startedAt = typeof evt.data.startedAt === "number" ? evt.data.startedAt : evt.ts
      const run = this.ensureRun(evt.runId, {
        runId: evt.runId,
        sessionKey: evt.sessionKey,
        sessionId: evt.sessionId,
        agentId: evt.agentId,
      })
      if (run && startedAt !== undefined && startedAt < run.startedAt) {
        run.startedAt = startedAt
        run.root.startMs = startedAt
      }
      return
    }
    if (evt.stream !== "assistant" && evt.stream !== "thinking") return
    const delta = evt.data?.delta
    if (typeof delta !== "string" || delta.length === 0) return
    const run = this.runs.get(evt.runId)
    if (!run) return
    const ts = evt.ts ?? this.now()
    if (run.deltas.length < MAX_DELTAS) run.deltas.push(ts)
    if (evt.stream === "thinking" && run.thinkingChars < MAX_THINKING_CHARS) {
      run.thinking.push({ ts, text: delta })
      run.thinkingChars += delta.length
    }
  }

  onCronChanged(evt: OpenClawCronChangedEvent): void {
    const agentId = evt.agentId ?? evt.job?.agentId ?? "main"
    const job = { id: evt.jobId, name: evt.job?.name }
    if (evt.action === "started" || evt.action === "added" || evt.action === "updated") {
      this.cronStarted.set(`job:${evt.jobId}`, job)
    }
    if (evt.action === "started") {
      this.cronStarted.set(agentId, job)
      if (evt.sessionKey) this.cronStarted.set(`session:${evt.sessionKey}`, job)
      return
    }
    if (evt.action === "finished") {
      if (this.cronStarted.get(agentId)?.id === evt.jobId) this.cronStarted.delete(agentId)
      if (evt.sessionKey) this.cronStarted.delete(`session:${evt.sessionKey}`)
    }
    if (evt.action === "removed") this.cronStarted.delete(`job:${evt.jobId}`)
  }

  // ─── Subagents ────────────────────────────────────────────────────────────

  onSubagentSpawned(evt: OpenClawSubagentSpawnedEvent, ctx: OpenClawSubagentContext): void {
    const parent = this.openRunForSession(ctx.requesterSessionKey)
    const childRunId = evt.runId ?? ctx.runId
    if (!childRunId) return
    this.evictStale()
    const traceId = parent?.traceId ?? hashHex(childRunId, 32)
    const parentSpanId = parent ? (parent.lastSpawnToolSpanId ?? parent.root.spanId) : ""
    const agentName = evt.label ?? evt.agentId
    const span: SpanRecord = {
      spanId: hashHex(`${childRunId}:subagent`, 16),
      traceId,
      parentSpanId,
      name: "subagent",
      kind: KIND_INTERNAL,
      startMs: this.now(),
      endMs: undefined,
      attrs: {
        ...(parent ? this.commonAttrs(parent) : {}),
        "gen_ai.agent.name": agentName,
        "subagent.name": agentName,
        "subagent.type": evt.agentId,
        "subagent.id": `${evt.agentId}:${childRunId}`,
        "openclaw.run.id": childRunId,
        "openclaw.parent.run.id": parent?.runId,
        "openclaw.subagent.child_session_key": evt.childSessionKey,
        "openclaw.subagent.agent_id": evt.agentId,
        "openclaw.subagent.label": evt.label,
        "openclaw.subagent.mode": evt.mode,
        "openclaw.subagent.thread_requested": evt.threadRequested,
        "openclaw.subagent.resolved_model": evt.resolvedModel,
        "openclaw.subagent.resolved_provider": evt.resolvedProvider,
        "openclaw.subagent.requester.channel": evt.requester?.channel,
        "openclaw.subagent.requester.account_id": evt.requester?.accountId,
        "openclaw.subagent.requester.to": evt.requester?.to,
        "openclaw.subagent.requester.thread_id":
          evt.requester?.threadId !== undefined ? String(evt.requester.threadId) : undefined,
        ...sessionAttrs(parent?.ctx.sessionId),
      },
    }
    if (parent) {
      parent.subagentIds.push(evt.agentId)
      parent.lastSpawnToolSpanId = undefined
    }
    this.pendingSubagents.set(childRunId, { span, parentRunId: parent?.runId ?? "", createdAt: this.now() })
    this.subagentLinks.set(childRunId, {
      traceId,
      parentSpanId: span.spanId,
      parentRunId: parent?.runId ?? "",
      sessionId: parent?.ctx.sessionId,
      agentName,
      createdAt: this.now(),
    })
    const child = this.runs.get(childRunId)
    if (child) this.applyLink(child)
  }

  onSubagentEnded(evt: OpenClawSubagentEndedEvent, ctx: OpenClawSubagentContext): void {
    const childRunId = evt.runId ?? ctx.runId
    if (!childRunId) return
    const pending = this.pendingSubagents.get(childRunId)
    if (!pending) return
    const span = pending.span
    span.endMs = evt.endedAt ?? this.now()
    const isError = evt.outcome === "error" || evt.outcome === "timeout" || Boolean(evt.error)
    span.outcome = isError ? "error" : "ok"
    span.errorMessage = evt.error
    Object.assign(span.attrs, {
      "openclaw.subagent.target_session_key": evt.targetSessionKey,
      "openclaw.subagent.target_kind": evt.targetKind,
      "openclaw.subagent.reason": evt.reason,
      "openclaw.subagent.outcome": evt.outcome,
      "openclaw.subagent.send_farewell": evt.sendFarewell,
      "openclaw.subagent.account_id": evt.accountId,
      "error.type": isError ? (evt.outcome ?? "error") : undefined,
      "error.message:gated": evt.error,
    })
    this.pendingSubagents.delete(childRunId)
    this.emitSubagentSpan(span, pending.parentRunId)
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private ensureRun(runId: string, ctx: OpenClawAgentContext): RunState | undefined {
    const existing = this.runs.get(runId)
    if (existing) {
      this.mergeCtx(existing, ctx)
      return existing
    }
    this.evictStale()
    const startedAt = this.now()
    const link = this.subagentLinks.get(runId)
    const traceId = link?.traceId ?? hashHex(runId, 32)
    const root: SpanRecord = {
      spanId: hashHex(`${runId}:interaction`, 16),
      traceId,
      parentSpanId: link?.parentSpanId ?? "",
      name: "interaction",
      kind: KIND_INTERNAL,
      startMs: startedAt,
      endMs: undefined,
      attrs: { "gen_ai.operation.name": "invoke_agent", "openclaw.run.id": runId },
    }
    const run: RunState = {
      runId,
      ctx: { ...ctx, runId },
      traceId,
      root,
      startedAt,
      history: [],
      inputMessages: [],
      inheritedHistory: [],
      historySource: "none",
      deltas: [],
      thinking: [],
      thinkingChars: 0,
      prompt: undefined,
      systemPrompt: undefined,
      toolDefinitions: undefined,
      llmCalls: [],
      openModelCalls: new Map(),
      openToolCalls: new Map(),
      openCompaction: undefined,
      closed: [],
      lastSpawnToolSpanId: undefined,
      subagentIds: [],
      sender: undefined,
      cron: undefined,
      link,
      aggregateUsage: {},
      output: undefined,
      endEvent: undefined,
      outputSeen: false,
      finalized: false,
      cancelGrace: undefined,
    }
    this.runs.set(runId, run)
    this.indexSession(run)
    this.resolveSender(run)
    this.resolveCron(run)
    return run
  }

  private mergeCtx(run: RunState, ctx: OpenClawAgentContext): void {
    let changed = false
    for (const [key, value] of Object.entries(ctx) as Array<[keyof OpenClawAgentContext, unknown]>) {
      if (value === undefined || value === null || value === "") continue
      if (run.ctx[key] === undefined) {
        ;(run.ctx as Record<string, unknown>)[key] = value
        changed = true
      }
    }
    if (!changed) return
    this.indexSession(run)
    this.resolveSender(run)
    this.resolveCron(run)
  }

  private indexSession(run: RunState): void {
    const key = run.ctx.sessionKey
    if (!key) return
    if (run.ctx.sessionId) remember(this.sessionIds, key, run.ctx.sessionId, SESSION_INDEX_MAX)
    const list = this.runsBySession.get(key) ?? []
    if (!list.includes(run.runId)) {
      list.push(run.runId)
      this.runsBySession.set(key, list)
    }
  }

  private resolveSender(run: RunState): void {
    if (run.sender?.name) return
    const id = run.ctx.senderId
    if (!id) return
    const cached =
      (run.ctx.sessionKey ? this.senders.get(run.ctx.sessionKey)?.get(id) : undefined) ?? this.sendersById.get(id)
    if (cached?.name) {
      run.sender = cached
      return
    }
    const fromPrompt = senderFromPrompt(run.prompt)
    run.sender = fromPrompt && fromPrompt.id === id ? fromPrompt : (cached ?? { id })
    if (run.sender.name) this.sendersById.set(id, run.sender)
  }

  private resolveCron(run: RunState): void {
    if (run.cron?.name || run.ctx.trigger !== "cron") return
    const fromKey = cronJobFromSessionKey(run.ctx.sessionKey)
    const bySession = run.ctx.sessionKey ? this.cronStarted.get(`session:${run.ctx.sessionKey}`) : undefined
    const job = fromKey
      ? (this.cronStarted.get(`job:${fromKey}`) ?? { id: fromKey })
      : (bySession ?? this.cronStarted.get(run.ctx.agentId ?? "main"))
    if (!job) return
    run.cron = job.name ? job : { id: job.id, name: cronNameFromPrompt(run.prompt, job.id) }
  }

  /**
   * History the harness withheld. The Codex harness passes an empty history
   * and only this turn's transcript, so the session is rebuilt from the turns
   * this process has seen, or from OpenClaw's transcript mirror on a cold start.
   */
  private inheritHistory(run: RunState, prompt: string | undefined): void {
    const sessionId = run.ctx.sessionId
    if (!sessionId) return
    const remembered = this.sessionHistory.get(sessionId)
    if (remembered) {
      run.inheritedHistory = [...remembered]
      run.historySource = "memory"
      return
    }
    const stateDir = this.stateDir ?? stateDirFromWorkspace(run.ctx.workspaceDir)
    const agentId = run.ctx.agentId
    if (!stateDir || !agentId) return
    const fromDatabase = readSessionTranscriptFromDatabase(
      agentDatabasePath(stateDir, agentId),
      sessionId,
      this.readTranscriptRows,
    )
    const stored =
      fromDatabase && fromDatabase.length > 0
        ? { messages: fromDatabase, source: "sqlite" as const }
        : {
            messages: readSessionTranscript(sessionTranscriptPath(stateDir, agentId, sessionId), this.readTranscript),
            source: "file" as const,
          }
    if (!stored.messages) return
    run.inheritedHistory = withoutCurrentPrompt(stored.messages, prompt, run.startedAt)
    run.historySource = stored.source
  }

  private openRunForSession(sessionKey: string | undefined): RunState | undefined {
    if (!sessionKey) return undefined
    const ids = this.runsBySession.get(sessionKey)
    if (!ids) return undefined
    for (let i = ids.length - 1; i >= 0; i--) {
      const run = this.runs.get(ids[i] as string)
      if (run && !run.finalized) return run
    }
    return undefined
  }

  private recordMemorySnapshot(run: RunState): void {
    if (!this.memoryEnabled) return
    const key = run.ctx.sessionKey ?? run.ctx.sessionId
    if (!key || this.memorySnapshotSessions.has(key)) return
    this.memorySnapshotSessions.add(key)
    const snapshot = memorySnapshot(run.ctx.workspaceDir, run.ctx.agentId, this.readFile)
    if (!snapshot) return
    const span = this.memorySpan(run, snapshot, undefined)
    span.attrs["openclaw.memory.source"] = "session_snapshot"
    run.closed.push(span)
  }

  private memorySpan(run: RunState, memory: MemoryEvent, parent: SpanRecord | undefined): SpanRecord {
    const at = this.now()
    return {
      spanId: hashHex(
        `${run.runId}:memory:${memory.operation}:${memory.recordId ?? ""}:${at}:${run.closed.length}`,
        16,
      ),
      traceId: run.traceId,
      parentSpanId: parent?.spanId ?? run.root.spanId,
      name: memory.operation,
      kind: KIND_CLIENT,
      startMs: parent?.startMs ?? at,
      endMs: parent?.endMs ?? at,
      outcome: "ok",
      attrs: {
        "gen_ai.operation.name": memory.operation,
        "gen_ai.provider.name": "openclaw",
        "gen_ai.memory.store.id": memory.storeId,
        "gen_ai.memory.record.id": memory.recordId,
        "gen_ai.memory.record.count": memory.records.length,
        "gen_ai.memory.query.text:gated": this.memoryContent ? memory.queryText : undefined,
        "gen_ai.memory.records:gated": this.memoryContent && memory.records.length > 0 ? memory.records : undefined,
        "openclaw.memory.body_unavailable": memory.bodyUnavailable ? true : undefined,
      },
    }
  }

  private applyLink(run: RunState): void {
    const link = this.subagentLinks.get(run.runId)
    if (!link) return
    run.link = link
    run.traceId = link.traceId
    run.root.parentSpanId = link.parentSpanId
    for (const span of [
      run.root,
      ...run.llmCalls,
      ...run.closed,
      ...run.openModelCalls.values(),
      ...run.openToolCalls.values(),
    ]) {
      span.traceId = link.traceId
    }
    if (run.openCompaction) run.openCompaction.traceId = link.traceId
  }

  private finalize(run: RunState): void {
    if (run.finalized) return
    run.finalized = true
    run.cancelGrace?.()
    run.cancelGrace = undefined
    this.applyLink(run)

    const evt = run.endEvent
    const now = this.now()
    const endMs = now
    const startMs = evt?.durationMs !== undefined ? Math.min(run.startedAt, endMs - evt.durationMs) : run.startedAt
    run.root.startMs = startMs
    run.root.endMs = endMs

    const transcript = evt?.messages ?? []
    this.resolveSender(run)
    this.resolveCron(run)
    const assistants = this.attributeCalls(run, transcript, startMs)
    this.applyTimeToFirstToken(run)
    this.applyStreamedReasoning(run)
    this.rememberHistory(run, transcript, startMs)
    const lastAssistant = assistants[assistants.length - 1]?.message ?? run.output?.lastAssistant
    const outputMessage = lastAssistant !== undefined ? normalizeMessage(lastAssistant) : undefined

    const success = evt ? evt.success : false
    run.root.outcome = success ? "ok" : "error"
    run.root.errorMessage = evt?.error ?? (evt ? undefined : "abandoned")
    Object.assign(run.root.attrs, {
      "user_prompt:gated": run.prompt,
      "gen_ai.input.messages:gated": run.inputMessages.length > 0 ? run.inputMessages : undefined,
      "gen_ai.output.messages:gated": outputMessage ? [{ ...outputMessage, role: "assistant" }] : undefined,
      "gen_ai.system_instructions:gated": run.systemPrompt ? systemInstructionsParts(run.systemPrompt) : undefined,
      "openclaw.run.success": success,
      "openclaw.duration_ms": evt?.durationMs,
      "openclaw.outcome": evt ? (success ? "completed" : "error") : "abandoned",
      "error.type": success ? undefined : evt ? "run_error" : "abandoned",
      "error.message:gated": evt?.error,
      "openclaw.llm_calls": run.llmCalls.length,
      "openclaw.tool_calls": run.closed.filter((s) => s.name.startsWith("tool_call:")).length,
      "interaction.kind": interactionKind(run),
      "interaction.duration_ms": endMs - startMs,
      "openclaw.history.source": run.historySource,
      "openclaw.history.messages": run.inheritedHistory.length,
    })

    for (const span of run.openModelCalls.values()) abandon(span, now)
    for (const span of run.openToolCalls.values()) abandon(span, now)
    if (run.openCompaction) abandon(run.openCompaction, now)
    const spans = [
      run.root,
      ...run.llmCalls,
      ...run.closed,
      ...run.openModelCalls.values(),
      ...run.openToolCalls.values(),
    ]
    if (run.openCompaction) spans.push(run.openCompaction)

    const common = this.commonAttrs(run)
    for (const span of spans) {
      for (const [k, v] of Object.entries(common)) {
        if (span.attrs[k] === undefined) span.attrs[k] = v
      }
    }

    this.runs.delete(run.runId)
    this.subagentLinks.delete(run.runId)
    const key = run.ctx.sessionKey
    if (key) {
      const ids = (this.runsBySession.get(key) ?? []).filter((id) => id !== run.runId)
      if (ids.length === 0) this.runsBySession.delete(key)
      else this.runsBySession.set(key, ids)
    }
    this.log(
      `run ${run.runId}: ${spans.length} spans, ${run.llmCalls.length} calls, history=${run.historySource}:${run.inheritedHistory.length}, transcript=${transcript.length}, deltas=${run.deltas.length}, thinking=${run.thinkingChars}`,
    )
    this.emit({ runId: run.runId, spans })
  }

  /**
   * Keep the session's conversation for the next turn of a harness that does
   * not pass history. A harness that passes the whole session on `agent_end`
   * replaces the remembered copy outright.
   */
  private rememberHistory(run: RunState, transcript: readonly unknown[], runStartMs: number): void {
    const sessionId = run.ctx.sessionId
    if (!sessionId || transcript.length === 0) return
    if (run.historySource === "harness") {
      this.sessionHistory.replace(sessionId, normalizeMessages(transcript))
      return
    }
    const turn = transcript.filter((m) => {
      const ts = (m as { timestamp?: unknown }).timestamp
      return typeof ts !== "number" || ts >= runStartMs - 5_000
    })
    this.sessionHistory.append(sessionId, run.inheritedHistory, normalizeMessages(turn))
  }

  /** Reasoning streamed during a call's window, when its transcript message carries none. */
  private applyStreamedReasoning(run: RunState): void {
    if (run.thinking.length === 0) return
    for (const call of run.llmCalls) {
      const endMs = call.endMs ?? call.startMs
      const text = run.thinking
        .filter((t) => t.ts > call.startMs - 1_000 && t.ts <= endMs + 1_000)
        .map((t) => t.text)
        .join("")
        .trim()
      if (text.length === 0) continue
      const output = call.attrs["gen_ai.output.messages:gated"] as Message[] | undefined
      const message = output?.[0]
      if (!message || message.parts.some((p) => p.type === "reasoning")) continue
      message.parts.unshift({ type: "reasoning", content: text })
      call.attrs["openclaw.reasoning.source"] = "stream"
    }
  }

  /** The first streamed delta inside a call's window, when the harness reported no TTFB. */
  private applyTimeToFirstToken(run: RunState): void {
    if (run.deltas.length === 0) return
    for (const call of run.llmCalls) {
      if (call.attrs["gen_ai.server.time_to_first_token"] !== undefined) continue
      const endMs = call.endMs ?? call.startMs
      const first = run.deltas.find((ts) => ts > call.startMs && ts <= endMs + 1_000)
      if (first === undefined) continue
      call.attrs["gen_ai.server.time_to_first_token"] = (first - call.startMs) * 1_000_000
      call.attrs["openclaw.ttft.source"] = "stream"
    }
  }

  /**
   * Per-call usage, cost and output come from the transcript's assistant
   * messages, each of which is one provider response. Calls and messages are
   * both chronological, so a message is matched to the call whose window
   * contains its timestamp, falling back to order when the counts line up.
   * A harness that never fires the per-call hooks still leaves its responses
   * in the transcript, so those become `llm_request` spans of their own.
   */
  private attributeCalls(
    run: RunState,
    transcript: readonly unknown[],
    runStartMs: number,
  ): Array<{ message: TranscriptAssistant; index: number }> {
    const assistants: Array<{ message: TranscriptAssistant; index: number }> = []
    transcript.forEach((m, index) => {
      if (!isTranscriptAssistant(m)) return
      const ts = typeof m.timestamp === "number" ? m.timestamp : undefined
      if (ts !== undefined && ts < runStartMs - 5_000) return
      assistants.push({ message: m, index })
    })

    if (run.llmCalls.length === 0) {
      for (const [i, entry] of assistants.entries()) {
        run.llmCalls.push(this.synthesizeCall(run, entry, i, transcript, runStartMs))
      }
      this.applyAggregateIfUnreported(run)
      return assistants
    }

    const unmatched = [...assistants]
    let matchedAny = false
    for (const [callIndex, call] of run.llmCalls.entries()) {
      const remainingCalls = run.llmCalls.length - callIndex
      let picked = unmatched.findIndex(({ message }) => {
        const ts = message.timestamp
        return ts !== undefined && ts >= call.startMs - 2_000 && ts <= (call.endMs ?? call.startMs) + 2_000
      })
      if (picked < 0 && unmatched.length === remainingCalls) picked = 0
      if (picked < 0) continue
      const [entry] = unmatched.splice(picked, 1)
      if (!entry) continue
      matchedAny = true
      this.enrichCall(call, entry.message, this.inputBefore(run, transcript, entry.index))
    }
    if (!matchedAny) {
      const last = run.llmCalls[run.llmCalls.length - 1]
      if (last) Object.assign(last.attrs, run.aggregateUsage, { "openclaw.usage.scope": "attempt" })
    }
    this.applyAggregateIfUnreported(run)
    return assistants
  }

  /** Everything the model saw before a given transcript index, including history the harness withheld. */
  private inputBefore(run: RunState, transcript: readonly unknown[], index: number): unknown[] {
    return [...run.inheritedHistory, ...transcript.slice(0, index)]
  }

  /**
   * A harness that reports usage only on the turn's final message leaves a
   * turn ending in a tool call with no usage at all; the attempt aggregate
   * from `llm_output` then goes on the last call.
   */
  private applyAggregateIfUnreported(run: RunState): void {
    const last = run.llmCalls[run.llmCalls.length - 1]
    if (!last || run.aggregateUsage["gen_ai.usage.total_tokens"] === undefined) return
    const reported = run.llmCalls.some((call) => Number(call.attrs["gen_ai.usage.total_tokens"] ?? 0) > 0)
    if (reported) return
    Object.assign(last.attrs, run.aggregateUsage, { "openclaw.usage.scope": "attempt" })
  }

  private synthesizeCall(
    run: RunState,
    entry: { message: TranscriptAssistant; index: number },
    index: number,
    transcript: readonly unknown[],
    runStartMs: number,
  ): SpanRecord {
    // A transcript message is stamped when it completes, so a response spans
    // from the previous message to its own timestamp.
    const endMs = entry.message.timestamp ?? run.startedAt
    const previous = transcript[entry.index - 1] as { timestamp?: unknown } | undefined
    const previousTs = typeof previous?.timestamp === "number" ? previous.timestamp : undefined
    const startMs =
      previousTs !== undefined && previousTs <= endMs ? Math.max(previousTs, runStartMs) : Math.min(runStartMs, endMs)
    const span: SpanRecord = {
      spanId: hashHex(`${run.runId}:llm_request:transcript:${index}`, 16),
      traceId: run.traceId,
      parentSpanId: run.root.spanId,
      name: "llm_request",
      kind: KIND_INTERNAL,
      startMs,
      endMs,
      outcome: "ok",
      attrs: {
        "gen_ai.operation.name": "chat",
        "gen_ai.provider.name": entry.message.provider ?? run.root.attrs["openclaw.provider"],
        "gen_ai.system": entry.message.provider ?? run.root.attrs["openclaw.provider"],
        "gen_ai.request.model": entry.message.model ?? run.root.attrs["gen_ai.request.model"],
        "llm_request.call_index": index,
        "openclaw.call.source": "transcript",
        "gen_ai.system_instructions:gated": run.systemPrompt ? systemInstructionsParts(run.systemPrompt) : undefined,
        "gen_ai.tool.definitions:gated": run.toolDefinitions,
      },
    }
    this.enrichCall(span, entry.message, this.inputBefore(run, transcript, entry.index))
    return span
  }

  private enrichCall(call: SpanRecord, message: TranscriptAssistant, before: readonly unknown[]): void {
    const output = normalizeMessage(message)
    const usage = message.usage as TranscriptUsage | undefined
    const reason = finishReason(message.stopReason)
    Object.assign(call.attrs, {
      "gen_ai.input.messages:gated":
        before.length > 0 ? normalizeMessages(before) : call.attrs["gen_ai.input.messages:gated"],
      "gen_ai.output.messages:gated": output ? [{ ...output, role: "assistant" }] : undefined,
      "gen_ai.response.model": message.responseModel ?? message.model,
      "gen_ai.response.id": message.responseId,
      "gen_ai.response.finish_reasons": reason ? [reason] : undefined,
      "openclaw.stop_reason": message.stopReason,
      ...usageAttrsFromTranscript(usage),
    })
    if (message.stopReason === "error" && message.errorMessage) {
      call.outcome = "error"
      call.errorMessage = message.errorMessage
      call.attrs["error.type"] = call.attrs["error.type"] ?? "provider_error"
      call.attrs["error.message:gated"] = message.errorMessage
    }
  }

  private commonAttrs(run: RunState): AttrInput {
    const sessionId = run.link?.sessionId ?? run.ctx.sessionId
    const enrichment = deriveEnrichment(
      {
        ctx: run.ctx,
        sender: run.sender,
        cron: run.cron,
        subagentIds: run.subagentIds,
        pluginVersion: this.pluginVersion,
      },
      { tags: this.operatorTags, metadata: this.operatorMetadata },
    )
    return {
      ...sessionAttrs(sessionId),
      "openclaw.session.id": run.ctx.sessionId,
      "openclaw.session.key": run.ctx.sessionKey,
      "openclaw.run.id": run.runId,
      "openclaw.agent.id": run.ctx.agentId,
      "gen_ai.agent.name": run.link?.agentName ?? run.ctx.agentId,
      "openclaw.workspace.dir": run.ctx.workspaceDir,
      "openclaw.channel": run.ctx.channel,
      "openclaw.channel.id": run.ctx.channelId,
      "openclaw.message.provider": run.ctx.messageProvider,
      "openclaw.trigger": run.ctx.trigger,
      "openclaw.cron.job.id": run.cron?.id,
      "openclaw.parent.run.id": run.link?.parentRunId || undefined,
      "user.id": run.sender?.id,
      "latitude.tags": enrichment.tags,
      "latitude.metadata": enrichment.metadata,
    }
  }

  private emitSubagentSpan(span: SpanRecord, parentRunId: string): void {
    const parent = this.runs.get(parentRunId)
    if (parent && !parent.finalized) {
      parent.closed.push(span)
      return
    }
    if (span.attrs["latitude.tags"] === undefined) {
      const enrichment = deriveEnrichment(
        { ctx: {}, subagentIds: [], pluginVersion: this.pluginVersion },
        { tags: this.operatorTags, metadata: this.operatorMetadata },
      )
      span.attrs["latitude.tags"] = enrichment.tags
      span.attrs["latitude.metadata"] = enrichment.metadata
    }
    this.emit({ runId: `subagent:${span.spanId}`, spans: [span] })
  }

  private evictStale(): void {
    const now = this.now()
    for (const [runId, link] of this.subagentLinks) {
      if (now - link.createdAt > LINK_TTL_MS) this.subagentLinks.delete(runId)
    }
    if (this.subagentLinks.size > LINK_MAX) {
      const sorted = Array.from(this.subagentLinks.entries()).sort((a, b) => a[1].createdAt - b[1].createdAt)
      for (const [runId] of sorted.slice(0, this.subagentLinks.size - LINK_MAX)) this.subagentLinks.delete(runId)
    }
    for (const [runId, pending] of this.pendingSubagents) {
      if (now - pending.createdAt > LINK_TTL_MS) {
        abandon(pending.span, now)
        pending.span.attrs["openclaw.subagent.outcome"] = "abandoned"
        this.pendingSubagents.delete(runId)
        this.emitSubagentSpan(pending.span, pending.parentRunId)
      }
    }
    for (const run of Array.from(this.runs.values())) {
      if (now - run.startedAt > RUN_TTL_MS) {
        this.log(`run ${run.runId} never ended; exporting as abandoned`)
        this.finalize(run)
      }
    }
  }

  private findOpenToolCallByName(run: RunState, toolName: string): string | undefined {
    const target = `tool_call:${toolName}`
    const entries = Array.from(run.openToolCalls.entries())
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      if (entry && entry[1].name === target) return entry[0]
    }
    return undefined
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toolCtxToAgentCtx(ctx: OpenClawToolContext, runId: string): OpenClawAgentContext {
  return {
    runId,
    agentId: ctx.agentId,
    sessionKey: ctx.sessionKey,
    sessionId: ctx.sessionId,
    channelId: ctx.channelId,
    channel: ctx.requester?.channel,
    accountId: ctx.requester?.accountId,
    senderId: ctx.requester?.senderId,
  }
}

function interactionKind(run: RunState): string {
  if (run.link) return "subagent"
  if (run.runId.startsWith("announce:")) return "announce"
  if (run.ctx.trigger === "cron") return "cron"
  return run.ctx.trigger ?? "user"
}

/** Cron prompts open with `[cron:<jobId> <job name>]`, the only place the name reaches a run. */
function cronNameFromPrompt(prompt: string | undefined, jobId: string): string | undefined {
  if (!prompt) return undefined
  const match = new RegExp(`^\\[cron:${jobId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ([^\\]]+)\\]`).exec(prompt)
  return match?.[1]?.trim() || undefined
}

/** Session keys are `agent:<agentId>:<rest>`. */
function agentIdFromSessionKey(sessionKey: string | undefined): string | undefined {
  const match = sessionKey ? /^agent:([^:]+):/.exec(sessionKey) : null
  return match?.[1]
}

function sessionAttrs(sessionId: string | undefined): AttrInput {
  if (!sessionId) return {}
  return { "session.id": sessionId, "gen_ai.session.id": sessionId }
}

function abandon(span: SpanRecord, now: number): void {
  span.endMs = now
  span.outcome = "error"
  span.attrs["openclaw.outcome"] = "abandoned"
  span.attrs["error.type"] = "abandoned"
}

/** Insertion-ordered cache: re-setting a key moves it to the back, and the oldest keys go once `max` is exceeded. */
function remember<K, V>(map: Map<K, V>, key: K, value: V, max: number): void {
  map.delete(key)
  map.set(key, value)
  for (const oldest of map.keys()) {
    if (map.size <= max) break
    map.delete(oldest)
  }
}

function hashHex(input: string, length: number): string {
  return createHash("sha256").update(input).digest("hex").slice(0, length)
}
