import type { ModelConfig, SeedScope, ToolConfig } from "@domain/shared/seeding"
import { SUPPORT_AGENT_TOOLS } from "@domain/shared/seeding"
import { Effect } from "effect"
import { insertJsonEachRow } from "../../sql.ts"
import { isSentinelPresent } from "../idempotency.ts"
import type { SeedContext, Seeder } from "../types.ts"
import {
  assistantTextMessage,
  assistantToolCallMessage,
  type Message,
  makeLlmSpan,
  makeToolSpan,
  makeWrapperSpan,
  type SpanRow,
  type TraceContext,
  toBase,
  toolResultMessage,
  userMessage,
} from "./span-builders.ts"

const TRACE_KEY = "agent-score-session"
const SERVICE_NAME = "billing-copilot"
const BATCH_SIZE = 500
const SECOND_MS = 1_000
const MILLISECOND_NS = 1_000_000

/**
 * Far enough back that the longest score window can still slide across it.
 *
 * A snapshot for a given date reads up to the 28 days before it, so a trend `n` days long needs
 * `n + 28` days of traffic behind it. At 45 the page opens on a fortnight of history, and the
 * per-day volume keeps even the oldest of those days above the floors the sampled dimensions need.
 */
const HISTORY_DAYS = 45

const MODEL: ModelConfig = {
  provider: "openai",
  model: "gpt-4.1",
  responseModel: "gpt-4.1-2025-04-14",
  scopeName: "openai-instrumentation",
  latencyRange: [600, 2500],
  finishReasonStop: "stop",
}

/**
 * What the day looked like, as shares of that day's sessions.
 *
 * The seed tells one story over its 45 days — a healthy service, a fortnight where it degraded, and
 * a recovery — because a score whose every day looks identical produces a flat trend that teaches
 * nobody how to read the chart. The shares are what the readers then rediscover from telemetry; no
 * number here is written to the score directly.
 */
interface DayProfile {
  readonly sessions: number
  readonly terminalFailureShare: number
  readonly slowGenerationShare: number
  readonly repeatedToolCallShare: number
  readonly recoveredToolErrorShare: number
}

const HEALTHY: DayProfile = {
  sessions: 72,
  terminalFailureShare: 0.006,
  slowGenerationShare: 0.14,
  repeatedToolCallShare: 0.05,
  recoveredToolErrorShare: 0.08,
}

const DEGRADED: DayProfile = {
  sessions: 84,
  terminalFailureShare: 0.018,
  slowGenerationShare: 0.55,
  repeatedToolCallShare: 0.22,
  recoveredToolErrorShare: 0.2,
}

const RECOVERING: DayProfile = {
  sessions: 78,
  terminalFailureShare: 0.009,
  slowGenerationShare: 0.24,
  repeatedToolCallShare: 0.08,
  recoveredToolErrorShare: 0.1,
}

const profileFor = (daysAgo: number): DayProfile => {
  if (daysAgo > 30) return HEALTHY
  if (daysAgo > 14) return DEGRADED
  return RECOVERING
}

/** Stable in [0, 1) for a given set of coordinates, so a re-seed rewrites the same rows. */
const unit = (...parts: readonly number[]): number => {
  let hash = 0x811c9dc5
  for (const part of parts) {
    hash = (hash ^ (part >>> 0)) >>> 0
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash / 0x1_0000_0000
}

const toolAt = (index: number): ToolConfig => SUPPORT_AGENT_TOOLS[index % SUPPORT_AGENT_TOOLS.length] as ToolConfig

const QUESTIONS = [
  "My invoice shows two charges for the same month, can you check?",
  "I need the VAT number added to last quarter's receipts.",
  "Why did my plan renew at a higher price than last year?",
  "Can you move my billing date to the 15th?",
  "The card on file expired and the retry keeps failing.",
  "I was charged after cancelling, please refund it.",
]

const ANSWERS = [
  "I refunded the duplicate charge; it lands back on your card within five working days.",
  "Added the VAT number and reissued the three receipts for last quarter.",
  "The renewal used the current list price because the legacy discount expired. I reapplied it.",
  "Your billing date now falls on the 15th, starting from the next cycle.",
  "I updated the card and the retry went through, so the account is current again.",
  "The cancellation had not reached billing. Refund issued and the subscription is closed.",
]

/**
 * How fast the generation ran, as a rate rather than a duration.
 *
 * The reference artifact expects a rate, so a fixture that pinned durations would make its own
 * speed depend on how many tokens it happened to produce. The healthy rate sits above the reference
 * and the slow one well under it, which is what puts avoidable time on the page at all.
 */
const HEALTHY_TOKENS_PER_SECOND = 108
const SLOW_TOKENS_PER_SECOND = 42
const HEALTHY_TTFT_MS = 300
const SLOW_TTFT_MS = 1_150

interface GenerationShape {
  readonly outputTokens: number
  readonly slow: boolean
}

const spanDurationMs = (span: SpanRow): number =>
  new Date(`${span.end_time}Z`).getTime() - new Date(`${span.start_time}Z`).getTime()

const generationSpan = ({
  scope,
  ctx,
  traceId,
  parentSpanId,
  index,
  step,
  startedAt,
  inputMessages,
  outputMessages,
  promptTokens,
  shape,
  tools,
}: {
  readonly scope: SeedScope
  readonly ctx: TraceContext
  readonly traceId: string
  readonly parentSpanId: string
  readonly index: number
  readonly step: number
  readonly startedAt: Date
  readonly inputMessages: Message[]
  readonly outputMessages: Message[]
  readonly promptTokens: number
  readonly shape: GenerationShape
  readonly tools?: readonly ToolConfig[]
}): SpanRow => {
  const tokensPerSecond = shape.slow ? SLOW_TOKENS_PER_SECOND : HEALTHY_TOKENS_PER_SECOND
  const ttftMs = shape.slow ? SLOW_TTFT_MS : HEALTHY_TTFT_MS
  const durationMs = ttftMs + Math.round((shape.outputTokens / tokensPerSecond) * SECOND_MS)

  const span = makeLlmSpan({
    base: toBase(ctx, traceId, parentSpanId, startedAt, durationMs),
    modelConfig: MODEL,
    inputMessages,
    outputMessages,
    systemInstructions: "You are a billing support copilot. Resolve the customer's request end to end.",
    ...(tools ? { toolDefinitions: [...tools] } : {}),
    finishReason: MODEL.finishReasonStop,
    promptTokens,
    completionTokens: shape.outputTokens,
    cacheProfile: { hitRate: 0.62, writeShare: 0.12 },
  })
  span.span_id = scope.spanHex(`${TRACE_KEY}:generation`, index * 10 + step)
  span.agent_name = SERVICE_NAME
  // The builder draws streaming and first-token timing at random; Speed is the dimension this
  // fixture exists for, so both are stated rather than sampled.
  span.is_streaming = 1
  span.time_to_first_token_ns = ttftMs * MILLISECOND_NS
  return span
}

interface SessionShape {
  readonly terminal: boolean
  readonly slow: boolean
  readonly repeatsToolCall: boolean
  readonly recoversToolError: boolean
}

const shapeFor = (index: number, profile: DayProfile): SessionShape => ({
  terminal: unit(index, 1) < profile.terminalFailureShare,
  slow: unit(index, 2) < profile.slowGenerationShare,
  repeatsToolCall: unit(index, 3) < profile.repeatedToolCallShare,
  recoversToolError: unit(index, 4) < profile.recoveredToolErrorShare,
})

/**
 * One customer conversation: a question, a lookup, and an answer.
 *
 * A terminal session ends on an assistant turn with nothing in it, which is the one shape
 * `score.md` counts as an operational failure without anybody classifying it — the readers see a
 * captured final turn carrying no content and the session could not have succeeded. Everything else
 * here is recoverable by design: a tool error followed by a working retry is recovery-family Cost
 * evidence and marginal Speed time, and it must not move Reliability.
 */
const buildSessionSpans = ({
  scope,
  index,
  startedAt,
  profile,
}: {
  readonly scope: SeedScope
  readonly index: number
  readonly startedAt: Date
  readonly profile: DayProfile
}): SpanRow[] => {
  const shape = shapeFor(index, profile)
  const traceId = scope.traceHex(TRACE_KEY, index)
  const tool = toolAt(index)
  const question = QUESTIONS[index % QUESTIONS.length] as string
  const answer = ANSWERS[index % ANSWERS.length] as string

  const ctx: TraceContext = {
    organizationId: scope.organizationId,
    projectId: scope.projectId,
    apiKeyId: scope.apiKeyId,
    simulationId: "",
    startTime: startedAt,
    sessionId: traceId,
    userId: "",
    userEmail: "",
    serviceName: SERVICE_NAME,
    tags: ["billing", "agent-score-history", shape.terminal ? "failure" : "success"],
    metadata: { seed: "agent-score-history" },
  }

  const callIds = [`call_${index}_0`, `call_${index}_1`]
  const requestedCalls = shape.repeatsToolCall
    ? callIds.map((id) => ({ id, name: tool.name, args: tool.sampleArgs }))
    : [{ id: callIds[0] as string, name: tool.name, args: tool.sampleArgs }]

  const rootSpanId = scope.spanHex(`${TRACE_KEY}:root`, index)
  const children: SpanRow[] = []
  let cursor = startedAt
  const conversation: Message[] = [userMessage(question)]

  const planning = generationSpan({
    scope,
    ctx,
    traceId,
    parentSpanId: rootSpanId,
    index,
    step: 0,
    startedAt: cursor,
    inputMessages: [...conversation],
    outputMessages: [assistantToolCallMessage(requestedCalls)],
    promptTokens: 4_200,
    shape: { outputTokens: 90, slow: shape.slow },
    tools: [tool],
  })
  children.push(planning)
  conversation.push(assistantToolCallMessage(requestedCalls))
  cursor = new Date(cursor.getTime() + spanDurationMs(planning) + 200)

  requestedCalls.forEach((call, callIndex) => {
    // Only the first attempt fails, so the retry beside it is what makes the incident recovered.
    const failed = shape.recoversToolError && callIndex === 0
    const toolSpan = makeToolSpan({
      base: toBase(ctx, traceId, rootSpanId, cursor, failed ? 4_100 : 700),
      tool,
      callId: call.id,
      ...(failed ? { error: { type: "UpstreamTimeout", message: `${tool.name} timed out` } } : {}),
    })
    toolSpan.span_id = scope.spanHex(`${TRACE_KEY}:tool`, index * 10 + callIndex)
    children.push(toolSpan)
    conversation.push(toolResultMessage(call.id, failed ? { error: "timeout" } : tool.sampleResult))
    cursor = new Date(cursor.getTime() + (failed ? 4_300 : 900))
  })

  const finalMessage = shape.terminal ? assistantTextMessage("") : assistantTextMessage(answer)
  const answering = generationSpan({
    scope,
    ctx,
    traceId,
    parentSpanId: rootSpanId,
    index,
    step: 1,
    startedAt: cursor,
    inputMessages: [...conversation],
    outputMessages: [finalMessage],
    promptTokens: 6_400,
    shape: { outputTokens: shape.terminal ? 0 : 260, slow: shape.slow },
  })
  children.push(answering)

  // The turn's envelope has to enclose every span inside it, or the critical path reports a child
  // outside its parent and the whole session stops being usable for Speed.
  const endedAt = new Date(cursor.getTime() + spanDurationMs(answering))
  const root = makeWrapperSpan({
    base: toBase(ctx, traceId, "", startedAt, endedAt.getTime() - startedAt.getTime()),
    name: `invoke_agent ${SERVICE_NAME}`,
  })
  root.span_id = rootSpanId
  root.operation = "invoke_agent"
  root.agent_name = SERVICE_NAME
  root.status_code = shape.terminal ? 2 : 1
  if (shape.terminal) root.error_type = "EmptyCompletion"

  return [root, ...children]
}

export const buildAgentScoreHistorySpans = (scope: SeedScope): SpanRow[] => {
  const spans: SpanRow[] = []
  let index = 0

  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const profile = profileFor(daysAgo)
    for (let session = 0; session < profile.sessions; session++) {
      // Spread across the working day so a session's last activity clears the eligibility debounce
      // on every date except the one being seeded.
      const hour = 7 + Math.floor(unit(index, 5) * 12)
      const minute = Math.floor(unit(index, 6) * 60)
      spans.push(...buildSessionSpans({ scope, index, startedAt: scope.dateDaysAgo(daysAgo, hour, minute), profile }))
      index++
    }
  }

  return spans
}

/**
 * The traffic the Agent Score page reads.
 *
 * Rides the canonical seed project rather than owning one, because the score is a property of a
 * project somebody is already looking at. Bootstrap-only: it is a fixture for one page, in the same
 * position the cost archetypes hold, so the runtime demo-project workflow never provisions it.
 */
export const agentScoreHistorySeeder: Seeder = {
  name: "spans/agent-score-history",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const sentinelSpanId = ctx.scope.spanHex(`${TRACE_KEY}:generation`, 0)
      const alreadySeeded = yield* isSentinelPresent(ctx.client, "spans", "span_id = {spanId:String}", {
        spanId: sentinelSpanId,
      })
      if (alreadySeeded) {
        if (!ctx.quiet) console.log("  -> spans/agent-score-history: already seeded, skipping")
        return
      }

      const spans = buildAgentScoreHistorySpans(ctx.scope)
      for (let offset = 0; offset < spans.length; offset += BATCH_SIZE) {
        yield* insertJsonEachRow(ctx.client, "spans", spans.slice(offset, offset + BATCH_SIZE))
      }
      if (!ctx.quiet) {
        const sessions = new Set(spans.map((span) => span.session_id)).size
        console.log(`  -> spans/agent-score-history: ${spans.length} spans across ${sessions} sessions`)
      }
    }),
}
