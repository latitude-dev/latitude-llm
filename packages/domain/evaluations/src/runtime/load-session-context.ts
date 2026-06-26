import type {
  ScriptCostBreakdown,
  ScriptSessionContext,
  ScriptTokenBreakdown,
  ScriptToolContext,
  ScriptTraceContext,
} from "@domain/sandbox"
import { type ChSqlClient, type OrganizationId, type ProjectId, type RepositoryError, SessionId } from "@domain/shared"
import {
  type SessionDetail,
  SessionRepository,
  type SessionToolSpan,
  type Span,
  SpanRepository,
  type TraceDetail,
} from "@domain/spans"
import { Effect } from "effect"
import { type EvaluationConversationMessage, toEvaluationConversationMessages } from "./evaluation-execution.ts"

const TOOL_IO_MAX_CHARS = 4_000

const truncate = (value: string): string =>
  value.length > TOOL_IO_MAX_CHARS ? `${value.slice(0, TOOL_IO_MAX_CHARS)}…` : value

const distinct = (values: readonly string[]): string[] => [...new Set(values.filter((value) => value !== ""))]

const sessionDuration = (start: Date, end: Date): number => (end.getTime() - start.getTime()) * 1_000_000

/**
 * Deduped, session-wide readable transcript: opening system instructions + the last responsive trace's
 * input + outputs (mirrors `analyze-session`'s reconstruction, avoiding the per-span input-accumulation
 * blowup). This is the single message store the script reads as `session.conversation`.
 */
const reconstructConversation = (session: SessionDetail): readonly EvaluationConversationMessage[] => {
  const systemMessage =
    Array.isArray(session.systemInstructions) && session.systemInstructions.length > 0
      ? [{ role: "system", parts: session.systemInstructions }]
      : []
  const messages = [...systemMessage, ...session.lastInputMessages, ...session.outputMessages]
  return toEvaluationConversationMessages(messages as Parameters<typeof toEvaluationConversationMessages>[0])
}

const buildTools = (toolSpans: readonly SessionToolSpan[]): Map<string, ScriptToolContext[]> => {
  const byTrace = new Map<string, ScriptToolContext[]>()
  for (const tool of toolSpans) {
    const tools = byTrace.get(tool.traceId) ?? []
    tools.push({
      name: tool.name,
      input: truncate(tool.input),
      output: truncate(tool.output),
      error: tool.error,
      duration: tool.durationNs,
    })
    byTrace.set(tool.traceId, tools)
  }
  return byTrace
}

const buildTraces = (spans: readonly Span[], toolSpans: readonly SessionToolSpan[]): ScriptTraceContext[] => {
  const toolsByTrace = buildTools(toolSpans)
  const byTrace = new Map<string, Span[]>()
  for (const span of spans) {
    const group = byTrace.get(span.traceId) ?? []
    group.push(span)
    byTrace.set(span.traceId, group)
  }

  return [...byTrace.entries()].map(([traceId, group]) => {
    const root = group.find((span) => span.parentSpanId === "") ?? group[0]
    const cost: ScriptCostBreakdown = {
      input: group.reduce((sum, s) => sum + s.costInputMicrocents, 0),
      output: group.reduce((sum, s) => sum + s.costOutputMicrocents, 0),
      total: group.reduce((sum, s) => sum + s.costTotalMicrocents, 0),
    }
    const tokens: ScriptTokenBreakdown = {
      input: group.reduce((sum, s) => sum + s.tokensInput, 0),
      output: group.reduce((sum, s) => sum + s.tokensOutput, 0),
      cacheRead: group.reduce((sum, s) => sum + s.tokensCacheRead, 0),
      cacheCreate: group.reduce((sum, s) => sum + s.tokensCacheCreate, 0),
      reasoning: group.reduce((sum, s) => sum + s.tokensReasoning, 0),
      total: group.reduce((sum, s) => sum + s.tokensInput + s.tokensOutput, 0),
    }
    return {
      id: traceId,
      name: root?.name ?? "",
      status: group.some((s) => s.statusCode === "error") ? "error" : "ok",
      errorCount: group.filter((s) => s.statusCode === "error").length,
      spanCount: group.length,
      duration: root ? sessionDuration(root.startTime, root.endTime) : 0,
      timeToFirstToken: root?.timeToFirstTokenNs ?? 0,
      cost,
      tokens,
      models: distinct(group.map((s) => s.model)),
      providers: distinct(group.map((s) => s.provider)),
      finishReasons: distinct(group.flatMap((s) => [...s.finishReasons])),
      tools: toolsByTrace.get(traceId) ?? [],
    } satisfies ScriptTraceContext
  })
}

const fromSessionDetail = (
  id: string,
  session: SessionDetail,
  conversation: readonly EvaluationConversationMessage[],
  traces: readonly ScriptTraceContext[],
): ScriptSessionContext => ({
  id,
  traceCount: session.traceCount,
  spanCount: session.spanCount,
  errorCount: session.errorCount,
  duration: session.durationNs,
  timeToFirstToken: session.timeToFirstTokenNs,
  cost: {
    input: session.costInputMicrocents,
    output: session.costOutputMicrocents,
    total: session.costTotalMicrocents,
  },
  tokens: {
    input: session.tokensInput,
    output: session.tokensOutput,
    total: session.tokensTotal,
    cacheRead: session.tokensCacheRead,
    cacheCreate: session.tokensCacheCreate,
    reasoning: session.tokensReasoning,
  },
  startTime: session.startTime.toISOString(),
  endTime: session.endTime.toISOString(),
  userId: session.userId,
  tags: [...session.tags],
  metadata: { ...session.metadata },
  conversation,
  traces,
})

/** Fallback when the session aggregate is absent (orphan single-trace sessions): build from the trace. */
const fromTraceDetail = (
  id: string,
  trace: TraceDetail,
  conversation: readonly EvaluationConversationMessage[],
  traces: readonly ScriptTraceContext[],
): ScriptSessionContext => ({
  id,
  traceCount: 1,
  spanCount: trace.spanCount,
  errorCount: trace.errorCount,
  duration: trace.durationNs,
  timeToFirstToken: trace.timeToFirstTokenNs,
  cost: {
    input: trace.costInputMicrocents,
    output: trace.costOutputMicrocents,
    total: trace.costTotalMicrocents,
  },
  tokens: {
    input: trace.tokensInput,
    output: trace.tokensOutput,
    total: trace.tokensTotal,
    cacheRead: trace.tokensCacheRead,
    cacheCreate: trace.tokensCacheCreate,
    reasoning: trace.tokensReasoning,
  },
  startTime: trace.startTime.toISOString(),
  endTime: trace.endTime.toISOString(),
  userId: trace.userId,
  tags: [...trace.tags],
  metadata: { ...trace.metadata },
  conversation,
  traces,
})

/**
 * Assembles the `ScriptSessionContext` an evaluation script runs against, from the triggering trace's
 * session. Reads the deduped conversation + aggregates from the session rollup, per-trace metrics from
 * the session's spans, and tool I/O from a focused tool-span read. Orphan sessions (no rollup row) fall
 * back to the single trace.
 */
export const loadScriptSessionContext = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly traceDetail: TraceDetail
}): Effect.Effect<ScriptSessionContext, RepositoryError, SessionRepository | SpanRepository | ChSqlClient> =>
  Effect.gen(function* () {
    const sessionId = SessionId(input.traceDetail.sessionId || input.traceDetail.traceId)
    const scope = { organizationId: input.organizationId, projectId: input.projectId, sessionId }

    const sessionRepository = yield* SessionRepository
    const spanRepository = yield* SpanRepository

    const sessionDetail = yield* sessionRepository
      .findBySessionId(scope)
      .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))
    const spans = yield* spanRepository.listBySessionId(scope)
    const toolSpans = yield* spanRepository.listToolSpansBySessionId(scope)

    const traces = buildTraces(spans, toolSpans)
    const conversation = sessionDetail
      ? reconstructConversation(sessionDetail)
      : toEvaluationConversationMessages(input.traceDetail.allMessages)

    return sessionDetail
      ? fromSessionDetail(sessionId, sessionDetail, conversation, traces)
      : fromTraceDetail(sessionId, input.traceDetail, conversation, traces)
  }).pipe(Effect.withSpan("evaluations.loadScriptSessionContext"))
