import { AI, AIError, type AIShape, EMBEDDING_DIMENSIONS } from "@domain/ai"
import { type ChSqlClient, OrganizationId, ProjectId, type TraceId } from "@domain/shared"
import { SpanRepository, type SpanRepositoryShape, TraceRepository, type TraceRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect, Layer } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { SpanRepositoryLive } from "./span-repository.ts"
import { TraceRepositoryLive } from "./trace-repository.ts"

/**
 * Validates the operation-gated rollup (migration 00038 / testkit schema):
 * - Path A (`traces_mv` → findByTraceId): conversation comes from the last
 *   real model-call leaf, not the Vercel wrapper summary, and usage is
 *   counted on leaves only, not double-counted with the wrapper.
 * - Path B (`findMessagesForTrace`): the wrapper drops out of the timeline and
 *   `generate_content` leaves are included.
 */

const mockAILayer = Layer.succeed(AI, {
  generate: () => Effect.fail(new AIError({ message: "not implemented" })),
  embed: () => Effect.succeed({ embedding: new Array(EMBEDDING_DIMENSIONS).fill(0.1) }),
  rerank: () => Effect.fail(new AIError({ message: "not implemented" })),
} as AIShape)

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")
const VERCEL_TRACE = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as TraceId
const ADK_TRACE = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as TraceId
const MEMORY_EXTRACT_TRACE = "cccccccccccccccccccccccccccccccc" as TraceId

const T0 = new Date("2026-06-18T10:00:00.000Z")
const at = (ms: number) => new Date(T0.getTime() + ms)
const chTime = (d: Date) => d.toISOString().replace("T", " ").replace("Z", "")

// v7/@ai-sdk/otel emits gen_ai.system_instructions ONLY on the invoke_agent
// wrapper — the chat leaves carry none.
const WRAPPER_SYSTEM = "WRAPPER_SYSTEM: you are a concise assistant."
const userMsg = { role: "user", parts: [{ type: "text", content: "What's the weather in SF?" }] }
const assistantToolCall = {
  role: "assistant",
  parts: [{ type: "tool_call", id: "call_1", name: "get_weather", arguments: { city: "SF" } }],
}
const toolResult = { role: "tool", parts: [{ type: "tool_call_response", id: "call_1", response: "sunny, 22C" }] }
const assistantFinal = { role: "assistant", parts: [{ type: "text", content: "LEAF_FINAL: sunny, 22C in SF." }] }
const agentRecommendation = {
  role: "assistant",
  parts: [
    {
      type: "text",
      content:
        "In Vienna under 90 EUR/night: Alfama Guesthouse at 58 EUR is the pick — ten minutes from the centre on foot.",
    },
  ],
}
const memoryExtractInput = {
  role: "user",
  parts: [
    {
      type: "text",
      content:
        "Traveler: Where should I stay in Vienna?\n\nAssistant: In Vienna under 90 EUR/night: Alfama Guesthouse at 58 EUR is the pick.",
    },
  ],
}
const memoryExtractOutput = { role: "assistant", parts: [{ type: "text", content: "[]" }] }
// The Vercel wrapper's lossy summary: final text welded with an orphan tool_call
// and no tool result — must never become the rolled-up conversation.
const wrapperSummary = {
  role: "assistant",
  parts: [
    { type: "text", content: "WRAPPER_SUMMARY" },
    { type: "tool_call", id: "call_1", name: "get_weather", arguments: { city: "SF" } },
  ],
}

function makeSpanRow(opts: {
  traceId: string
  spanId: string
  parentSpanId?: string
  operation: string
  startTime: Date
  endTime: Date
  tokensInput?: number
  tokensOutput?: number
  costTotalMicrocents?: number
  inputMessages?: unknown[]
  outputMessages?: unknown[]
  systemInstructions?: string
  toolName?: string
}): SpanRow {
  return {
    organization_id: ORG_ID,
    project_id: PROJECT_ID,
    session_id: "",
    user_id: "",
    trace_id: opts.traceId,
    span_id: opts.spanId,
    parent_span_id: opts.parentSpanId ?? "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: chTime(opts.startTime),
    end_time: chTime(opts.endTime),
    name: opts.operation,
    service_name: "test-service",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: opts.operation,
    provider: "",
    model: "",
    agent_name: "",
    response_model: "",
    tokens_input: opts.tokensInput ?? 0,
    tokens_output: opts.tokensOutput ?? 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: opts.costTotalMicrocents ?? 0,
    cost_is_estimated: 0,
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
    input_messages: opts.inputMessages ? JSON.stringify(opts.inputMessages) : "",
    output_messages: opts.outputMessages ? JSON.stringify(opts.outputMessages) : "",
    system_instructions: opts.systemInstructions
      ? JSON.stringify([{ type: "text", content: opts.systemInstructions }])
      : "",
    tool_definitions: "",
    tool_call_id: "",
    tool_name: opts.toolName ?? "",
    tool_input: "",
    tool_output: "",
    attr_string: {},
    attr_int: {},
    attr_float: {},
    attr_bool: {},
    resource_string: {},
    scope_name: "",
    scope_version: "",
  }
}

// A Vercel-v7-shaped trace: two chat leaves carrying the real per-call turns +
// per-call usage, and an `invoke_agent` wrapper that ends last with the lossy
// summary and the duplicated aggregate usage.
const VERCEL_SPANS: SpanRow[] = [
  makeSpanRow({
    traceId: VERCEL_TRACE,
    spanId: "1111111111111111",
    operation: "chat",
    startTime: at(0),
    endTime: at(1_000),
    tokensInput: 100,
    tokensOutput: 20,
    costTotalMicrocents: 1_000,
    inputMessages: [userMsg],
    outputMessages: [assistantToolCall],
  }),
  makeSpanRow({
    traceId: VERCEL_TRACE,
    spanId: "2222222222222222",
    operation: "execute_tool",
    startTime: at(1_100),
    endTime: at(1_400),
    toolName: "get_weather",
  }),
  makeSpanRow({
    traceId: VERCEL_TRACE,
    spanId: "3333333333333333",
    operation: "chat",
    startTime: at(1_500),
    endTime: at(2_000),
    tokensInput: 50,
    tokensOutput: 10,
    costTotalMicrocents: 500,
    inputMessages: [userMsg, assistantToolCall, toolResult],
    outputMessages: [assistantFinal],
  }),
  makeSpanRow({
    traceId: VERCEL_TRACE,
    spanId: "9999999999999999",
    operation: "invoke_agent",
    startTime: at(0),
    endTime: at(3_000), // ends LAST — would win the un-gated argMax
    tokensInput: 150, // aggregate (== sum of the two leaves) — the double-count source
    tokensOutput: 30,
    costTotalMicrocents: 1_500,
    inputMessages: [userMsg],
    outputMessages: [wrapperSummary],
    systemInstructions: WRAPPER_SYSTEM, // only the wrapper carries system (v7 shape)
  }),
]

// Agent reply followed by a later memory-extract `chat` leaf that returns only
// a JSON array. Plain end_time ranking would pick the extractor; prose ranking
// must keep the recommendation as the rolled-up conversation.
const MEMORY_EXTRACT_SPANS: SpanRow[] = [
  makeSpanRow({
    traceId: MEMORY_EXTRACT_TRACE,
    spanId: "bbbb111111111111",
    operation: "chat",
    startTime: at(0),
    endTime: at(2_000),
    tokensInput: 200,
    tokensOutput: 80,
    costTotalMicrocents: 900,
    inputMessages: [userMsg],
    outputMessages: [agentRecommendation],
    systemInstructions: "You are Atlas, a travel planning assistant.",
  }),
  makeSpanRow({
    traceId: MEMORY_EXTRACT_TRACE,
    spanId: "bbbb222222222222",
    operation: "chat",
    startTime: at(2_100),
    endTime: at(3_000), // ends LAST — would win un-gated / end_time-only ranking
    tokensInput: 100,
    tokensOutput: 12,
    costTotalMicrocents: 50,
    inputMessages: [memoryExtractInput],
    outputMessages: [memoryExtractOutput],
    systemInstructions: "You extract durable travel facts. Respond with only a JSON array.",
  }),
]

// A Google-ADK-shaped trace: a single `generate_content` leaf (the real model
// call) under an inert `invoke_agent` wrapper with no usage/conversation.
const ADK_SPANS: SpanRow[] = [
  makeSpanRow({
    traceId: ADK_TRACE,
    spanId: "aaaa111111111111",
    operation: "invoke_agent",
    startTime: at(0),
    endTime: at(2_000),
  }),
  makeSpanRow({
    traceId: ADK_TRACE,
    spanId: "aaaa222222222222",
    operation: "generate_content",
    startTime: at(500),
    endTime: at(1_500),
    tokensInput: 80,
    tokensOutput: 40,
    costTotalMicrocents: 700,
    inputMessages: [userMsg],
    outputMessages: [assistantFinal],
  }),
]

const ch = setupTestClickHouse()

const serialize = (messages: readonly unknown[]) => JSON.stringify(messages)

describe("operation-gated rollup", () => {
  let traceRepo: TraceRepositoryShape
  let spanRepo: SpanRepositoryShape

  beforeAll(async () => {
    traceRepo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* TraceRepository
      }).pipe(withClickHouse(TraceRepositoryLive.pipe(Layer.provideMerge(mockAILayer)), ch.client, ORG_ID)),
    )
    spanRepo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* SpanRepository
      }).pipe(withClickHouse(SpanRepositoryLive, ch.client, ORG_ID)),
    )
  })

  // Insert after the testkit's beforeEach TRUNCATE (registered first, so it runs first).
  beforeEach(async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [...VERCEL_SPANS, ...ADK_SPANS, ...MEMORY_EXTRACT_SPANS]),
    )
  })

  const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient | AI>) =>
    Effect.runPromise(effect.pipe(Effect.provide(mockAILayer), Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

  describe("Path A — traces_mv rollup (findByTraceId)", () => {
    it("rolls up the conversation from the last chat leaf, not the Vercel wrapper summary", async () => {
      const detail = await runCh(
        traceRepo.findByTraceId({ organizationId: ORG_ID, projectId: PROJECT_ID, traceId: VERCEL_TRACE }),
      )

      // Conversation == last chat leaf's turn (input + output), wrapper excluded.
      const serialized = serialize(detail.allMessages)
      expect(serialized).toContain("LEAF_FINAL")
      expect(serialized).not.toContain("WRAPPER_SUMMARY")
      expect(detail.allMessages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant"])
      expect(serialize(detail.outputMessages)).toContain("LEAF_FINAL")
      expect(serialize(detail.outputMessages)).not.toContain("WRAPPER_SUMMARY")
    })

    it("surfaces system instructions from the invoke_agent wrapper (v7 leaves carry none)", async () => {
      const detail = await runCh(
        traceRepo.findByTraceId({ organizationId: ORG_ID, projectId: PROJECT_ID, traceId: VERCEL_TRACE }),
      )

      // The wrapper is the only span with system instructions; the gate must let it through.
      expect(serialize(detail.systemInstructions)).toContain("WRAPPER_SYSTEM")
      expect(detail.allMessages[0]?.role).toBe("system")
      expect(serialize(detail.allMessages[0]?.parts)).toContain("WRAPPER_SYSTEM")
    })

    it("counts usage on leaves only — the v7 wrapper aggregate is not double-counted", async () => {
      const detail = await runCh(
        traceRepo.findByTraceId({ organizationId: ORG_ID, projectId: PROJECT_ID, traceId: VERCEL_TRACE }),
      )

      // 100 + 50 leaves only (NOT + 150 wrapper, which would be 300).
      expect(detail.tokensInput).toBe(150)
      expect(detail.tokensOutput).toBe(30)
    })

    it("honors generate_content as a real model-call leaf (Google ADK)", async () => {
      const detail = await runCh(
        traceRepo.findByTraceId({ organizationId: ORG_ID, projectId: PROJECT_ID, traceId: ADK_TRACE }),
      )

      expect(serialize(detail.allMessages)).toContain("LEAF_FINAL")
      expect(detail.tokensInput).toBe(80)
      expect(detail.tokensOutput).toBe(40)
    })

    it("keeps the agent prose reply when a later memory-extract chat returns a JSON array", async () => {
      const detail = await runCh(
        traceRepo.findByTraceId({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: MEMORY_EXTRACT_TRACE,
        }),
      )

      const serialized = serialize(detail.allMessages)
      expect(serialized).toContain("Alfama Guesthouse")
      expect(serialized).not.toContain("Traveler:")
      expect(serialize(detail.outputMessages)).toContain("Alfama Guesthouse")
      expect(serialize(detail.outputMessages)).not.toContain('"content":"[]"')
    })
  })

  describe("Path B — span message walk (findMessagesForTrace)", () => {
    it("excludes the invoke_agent wrapper and keeps the chat + execute_tool leaves", async () => {
      const rows = await runCh(
        spanRepo.findMessagesForTrace({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: VERCEL_TRACE,
          startTimeFrom: at(-1_000),
          startTimeTo: at(10_000),
        }),
      )

      const operations = rows.map((r) => r.operation).sort()
      expect(operations).toEqual(["chat", "chat", "execute_tool"])
      expect(serialize(rows.flatMap((r) => r.outputMessages))).not.toContain("WRAPPER_SUMMARY")
    })

    it("includes generate_content leaves in the timeline", async () => {
      const rows = await runCh(
        spanRepo.findMessagesForTrace({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceId: ADK_TRACE,
          startTimeFrom: at(-1_000),
          startTimeTo: at(10_000),
        }),
      )

      expect(rows.map((r) => r.operation)).toEqual(["generate_content"])
    })
  })
})
