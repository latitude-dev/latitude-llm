import { type ChSqlClient, OrganizationId, ProjectId, SpanId, TraceId } from "@domain/shared"
import { SpanRepository, type SpanRepositoryShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import { insertJsonEachRow } from "../sql.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { SpanRepositoryLive } from "./span-repository.ts"

const ch = setupTestClickHouse()

const ORG_ID = OrganizationId("org_cost_facts")
const PROJECT_ID = ProjectId("proj_cost_facts")
const OTHER_PROJECT_ID = ProjectId("proj_cost_facts_other")
const TRACE_A = TraceId("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
const TRACE_B = TraceId("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
const UNLIMITED_BUDGET = { perSessionBytes: 1_000_000, totalBytes: 10_000_000 }
const SESSION_KEYS = new Map([
  [TRACE_A as string, "session-a"],
  [TRACE_B as string, "session-b"],
])

const messages = (content: string) => JSON.stringify([{ role: "user", parts: [{ type: "text", content }] }])

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

const spanRow = (overrides: Record<string, unknown>) => ({
  organization_id: ORG_ID,
  project_id: PROJECT_ID,
  session_id: "session-a",
  user_id: "",
  trace_id: TRACE_A,
  span_id: "1111111111111111",
  parent_span_id: "",
  api_key_id: "",
  simulation_id: "",
  start_time: "2026-01-01 00:00:00.000000000",
  end_time: "2026-01-01 00:00:01.000000000",
  name: "chat",
  service_name: "svc",
  kind: 0,
  status_code: 0,
  status_message: "",
  error_type: "",
  tags: [],
  metadata: {},
  operation: "chat",
  provider: "openai",
  model: "gpt-4o",
  agent_name: "",
  response_model: "gpt-4o-2024-08-06",
  tokens_input: 100,
  tokens_output: 20,
  tokens_cache_read: 40,
  tokens_cache_create: 10,
  tokens_reasoning: 5,
  cost_input_microcents: 700,
  cost_output_microcents: 300,
  cost_total_microcents: 1_000,
  cost_is_estimated: 1,
  cost_source: "estimated",
  cost_priced_provider: "openai",
  cost_priced_model: "gpt-4o",
  time_to_first_token_ns: 250_000_000,
  is_streaming: 1,
  response_id: "resp-1",
  finish_reasons: ["stop"],
  input_messages: "",
  output_messages: "",
  system_instructions: "",
  tool_definitions: "",
  tool_call_id: "",
  tool_name: "",
  tool_input: "",
  tool_output: "",
  attr_string: {},
  attr_int: {},
  attr_float: {},
  attr_bool: {},
  resource_string: {},
  scope_name: "",
  scope_version: "",
  ingested_at: "2026-01-01 00:00:00.000",
  ...overrides,
})

describe("SpanRepository Cost and Speed source facts", () => {
  let repo: SpanRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* SpanRepository
      }).pipe(withClickHouse(SpanRepositoryLive, ch.client, ORG_ID)),
    )
  })

  const readGenerations = (traceIds: readonly TraceId[], budget = UNLIMITED_BUDGET, startTimeTo?: Date) =>
    runCh(
      repo.listGenerationFactsByTraceIds({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        traceIds,
        contentBudget: budget,
        sessionKeyByTraceId: SESSION_KEYS,
        ...(startTimeTo ? { startTimeTo } : {}),
      }),
    )

  describe("listGenerationFactsByTraceIds", () => {
    it("projects the scoring columns, dedupes by newest ingest, and scopes by project and cutoff", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          spanRow({ name: "stale", ingested_at: "2026-01-01 00:00:00.000" }),
          spanRow({ name: "current", ingested_at: "2026-01-01 00:00:05.000" }),
          spanRow({ span_id: "2222222222222222", project_id: OTHER_PROJECT_ID, name: "other-project" }),
          spanRow({
            span_id: "3333333333333333",
            name: "after-cutoff",
            start_time: "2026-02-01 00:00:00.000000000",
            end_time: "2026-02-01 00:00:01.000000000",
          }),
        ]),
      )

      const facts = await readGenerations([TRACE_A], UNLIMITED_BUDGET, new Date("2026-01-01T00:00:30.000Z"))

      expect(facts).toHaveLength(1)
      expect(facts[0]).toMatchObject({
        traceId: TRACE_A,
        spanId: SpanId("1111111111111111"),
        operation: "chat",
        provider: "openai",
        model: "gpt-4o",
        responseModel: "gpt-4o-2024-08-06",
        name: "current",
        durationNs: 1_000_000_000,
        tokens: {
          tokensInput: 100,
          tokensOutput: 20,
          tokensCacheRead: 40,
          tokensCacheCreate: 10,
          tokensReasoning: 5,
        },
        costInputMicrocents: 700,
        costOutputMicrocents: 300,
        costTotalMicrocents: 1_000,
        costSource: "estimated",
        isStreaming: true,
        timeToFirstTokenNs: 250_000_000,
        finishReasons: ["stop"],
        pricingState: "registryEstimated",
        modelContextState: "known",
      })
      expect(facts[0]?.modelContextLimitTokens ?? 0).toBeGreaterThan(0)
    })

    it("reports absent content without loading a payload", async () => {
      await runCh(insertJsonEachRow(ch.client, "spans", [spanRow({})]))

      const [fact] = await readGenerations([TRACE_A])

      expect(fact?.content).toBeNull()
      expect(fact?.capturedBytes).toEqual({ inputMessages: 0, outputMessages: 0, toolDefinitions: 0 })
      expect(fact?.inputContentState).toBe("absent")
      expect(fact?.outputContentState).toBe("absent")
      expect(fact?.toolDefinitionContentState).toBe("absent")
    })

    it("loads captured content and parses input, output, and tool definitions", async () => {
      const toolDefinitions = JSON.stringify([{ name: "search", description: "Search", parameters: {} }])
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          spanRow({
            input_messages: messages("hello"),
            output_messages: messages("world"),
            tool_definitions: toolDefinitions,
          }),
        ]),
      )

      const [fact] = await readGenerations([TRACE_A])

      expect(fact?.inputContentState).toBe("captured")
      expect(fact?.content?.inputMessages).toHaveLength(1)
      expect(fact?.content?.outputMessages).toHaveLength(1)
      expect(fact?.content?.toolDefinitions).toEqual([{ name: "search", description: "Search", parameters: {} }])
      expect(fact?.capturedBytes.inputMessages).toBeGreaterThan(0)
    })

    it("marks a payload the budget could not afford as truncated, never absent", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          spanRow({ input_messages: messages("x".repeat(4_000)), output_messages: messages("y") }),
        ]),
      )

      const [fact] = await readGenerations([TRACE_A], { perSessionBytes: 16, totalBytes: 16 })

      expect(fact?.content).toBeNull()
      expect(fact?.capturedBytes.inputMessages).toBeGreaterThan(16)
      expect(fact?.inputContentState).toBe("truncated")
      expect(fact?.outputContentState).toBe("truncated")
      expect(fact?.toolDefinitionContentState).toBe("absent")
    })

    it("keeps one batched read across traces and spends each session's budget separately", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          spanRow({ input_messages: messages("a".repeat(200)) }),
          spanRow({
            trace_id: TRACE_B,
            session_id: "session-b",
            span_id: "4444444444444444",
            input_messages: messages("b".repeat(200)),
          }),
        ]),
      )

      const facts = await readGenerations([TRACE_A, TRACE_B], { perSessionBytes: 4_096, totalBytes: 8_192 })

      expect(facts.map((fact) => fact.traceId)).toEqual([TRACE_A, TRACE_B])
      expect(facts.every((fact) => fact.content !== null)).toBe(true)
    })

    it("classifies pricing and model coverage from the retained columns", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          spanRow({ span_id: "5555555555555555", cost_source: "unknown", cost_total_microcents: 0 }),
          spanRow({
            span_id: "6666666666666666",
            provider: "ollama",
            model: "llama3",
            cost_source: "unpriced",
            cost_total_microcents: 0,
            cost_is_estimated: 0,
          }),
          spanRow({
            span_id: "7777777777777777",
            provider: "",
            model: "",
            cost_source: "unpriced",
            cost_total_microcents: 0,
            cost_is_estimated: 0,
          }),
          spanRow({ span_id: "8888888888888888", operation: "execute_tool", cost_source: "no_tokens" }),
        ]),
      )

      const facts = await readGenerations([TRACE_A])
      const stateOf = (spanId: string) => facts.find((fact) => fact.spanId === SpanId(spanId))

      expect(stateOf("5555555555555555")?.pricingState).toBe("legacyUnknown")
      expect(stateOf("6666666666666666")?.pricingState).toBe("knownFree")
      expect(stateOf("7777777777777777")).toMatchObject({
        pricingState: "unknownPair",
        modelContextState: "unknownPair",
        modelContextLimitTokens: null,
      })
      expect(stateOf("8888888888888888")?.pricingState).toBe("notSpendBearing")
    })

    it("returns nothing for an empty trace list", async () => {
      expect(await readGenerations([])).toEqual([])
    })
  })

  describe("listToolCallFactsByTraceIds", () => {
    const readToolCalls = (traceIds: readonly TraceId[]) =>
      runCh(repo.listToolCallFactsByTraceIds({ organizationId: ORG_ID, projectId: PROJECT_ID, traceIds }))

    const toolRow = (overrides: Record<string, unknown>) =>
      spanRow({ operation: "execute_tool", provider: "", model: "", cost_source: "no_tokens", ...overrides })

    it("hashes whitespace-normalized payloads without transferring them", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          toolRow({
            span_id: "1111111111111111",
            tool_call_id: "call-1",
            tool_name: "Search_Docs",
            tool_input: '{"query": "a"}',
            tool_output: '{"hits": 0}',
          }),
          toolRow({
            span_id: "2222222222222222",
            tool_call_id: "call-2",
            tool_name: "search_docs",
            tool_input: '{"query":    "a"}',
            tool_output: '{"hits":\n0}',
            start_time: "2026-01-01 00:00:02.000000000",
            end_time: "2026-01-01 00:00:03.000000000",
          }),
        ]),
      )

      const facts = await readToolCalls([TRACE_A])

      expect(facts).toHaveLength(2)
      expect(facts.map((fact) => fact.normalizedToolName)).toEqual(["search_docs", "search_docs"])
      expect(facts[0]?.inputHash).toBe(facts[1]?.inputHash)
      expect(facts[0]?.outputHash).toBe(facts[1]?.outputHash)
      expect(facts[0]).toMatchObject({ toolCallId: "call-1", spanId: SpanId("1111111111111111") })
      expect(facts[0]?.inputBytes).toBeGreaterThan(0)
    })

    it("leaves an empty payload unhashed so readers can treat it as unreadable", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          toolRow({ span_id: "3333333333333333", tool_call_id: "call-3", tool_name: "noop", tool_input: "" }),
        ]),
      )

      const [fact] = await readToolCalls([TRACE_A])

      expect(fact?.inputHash).toBe("")
      expect(fact?.inputBytes).toBe(0)
      expect(fact?.outputHash).toBe("")
    })

    it("distinguishes different payloads and carries failure evidence", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          toolRow({
            span_id: "4444444444444444",
            tool_call_id: "call-4",
            tool_name: "fetch",
            tool_input: '{"url":"a"}',
            tool_output: "ok",
          }),
          toolRow({
            span_id: "5555555555555555",
            tool_call_id: "call-5",
            tool_name: "fetch",
            tool_input: '{"url":"b"}',
            tool_output: "boom",
            status_code: 2,
            status_message: "request failed",
            error_type: "HTTPError",
            start_time: "2026-01-01 00:00:02.000000000",
            end_time: "2026-01-01 00:00:04.000000000",
          }),
        ]),
      )

      const facts = await readToolCalls([TRACE_A])

      expect(facts[0]?.inputHash).not.toBe(facts[1]?.inputHash)
      expect(facts[1]).toMatchObject({
        statusCode: "error",
        statusMessage: "request failed",
        errorType: "HTTPError",
        durationNs: 2_000_000_000,
      })
    })

    it("excludes non-tool spans, other projects, and an empty trace list", async () => {
      await runCh(
        insertJsonEachRow(ch.client, "spans", [
          spanRow({ span_id: "6666666666666666" }),
          toolRow({ span_id: "7777777777777777", project_id: OTHER_PROJECT_ID, tool_name: "other" }),
        ]),
      )

      expect(await readToolCalls([TRACE_A])).toEqual([])
      expect(await readToolCalls([])).toEqual([])
    })
  })
})
