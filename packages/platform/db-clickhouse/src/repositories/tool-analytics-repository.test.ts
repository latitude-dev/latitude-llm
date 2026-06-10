import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import type { ToolAnalyticsRepositoryShape, ToolAnalyticsScope } from "@domain/spans"
import { ToolAnalyticsRepository } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { ToolAnalyticsRepositoryLive } from "./tool-analytics-repository.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")

const SCOPE: ToolAnalyticsScope = {
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  from: new Date("2026-03-01T00:00:00Z"),
  to: new Date("2026-03-31T00:00:00Z"),
}

// trace_id is FixedString(32), span_id FixedString(16) — pad short labels.
const tid = (label: string) => label.padEnd(32, "0")
const sid = (label: string) => label.padEnd(16, "0")

// Each top-level describe block opens its own chdb session via `setupFixture`
// (same memory-bounding pattern as score-analytics-repository.test.ts).
function setupFixture() {
  const ch = setupTestClickHouse()
  let repo: ToolAnalyticsRepositoryShape | undefined

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* ToolAnalyticsRepository
      }).pipe(withClickHouse(ToolAnalyticsRepositoryLive, ch.client, ORG_ID)),
    )
  })

  return {
    get repo() {
      if (!repo) throw new Error("repo not initialized — fixture used before beforeAll ran")
      return repo
    },
    runCh: <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
      Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID)))),
    insertSpans: async (rows: SpanRow[]) => {
      await ch.client.insert({ table: "spans", values: rows, format: "JSONEachRow" })
    },
  }
}

function makeSpanRow(overrides: Partial<SpanRow> & { trace_id: string; span_id: string }): SpanRow {
  return {
    organization_id: ORG_ID as string,
    project_id: PROJECT_ID as string,
    session_id: "",
    user_id: "",
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: "2026-03-15 12:00:00.000",
    end_time: "2026-03-15 12:00:01.000",
    name: "test-span",
    service_name: "test-service",
    kind: 1,
    status_code: 1,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: "",
    provider: "",
    model: "",
    response_model: "",
    tokens_input: 0,
    tokens_output: 0,
    tokens_cache_read: 0,
    tokens_cache_create: 0,
    tokens_reasoning: 0,
    cost_input_microcents: 0,
    cost_output_microcents: 0,
    cost_total_microcents: 0,
    cost_is_estimated: 0,
    time_to_first_token_ns: 0,
    is_streaming: 0,
    response_id: "",
    finish_reasons: [],
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
    ...overrides,
  }
}

/** Chat span carrying tool definitions (raw JSON so tests control the exact payload). */
function chatSpan(overrides: {
  trace_id: string
  span_id: string
  toolDefinitionsJson?: string
  session_id?: string
  start_time?: string
  model?: string
  provider?: string
}): SpanRow {
  return makeSpanRow({
    trace_id: overrides.trace_id,
    span_id: overrides.span_id,
    session_id: overrides.session_id ?? "",
    start_time: overrides.start_time ?? "2026-03-15 12:00:00.000",
    end_time: overrides.start_time ?? "2026-03-15 12:00:00.000",
    name: "chat test-model",
    operation: "chat",
    model: overrides.model ?? "test-model",
    provider: overrides.provider ?? "test-provider",
    tool_definitions: overrides.toolDefinitionsJson ?? "",
  })
}

/** execute_tool span. Duration is endMs - startMs of the provided times. */
function callSpan(overrides: {
  trace_id: string
  span_id: string
  tool_name: string
  session_id?: string
  start_time?: string
  end_time?: string
  status_code?: number
  error_type?: string
  status_message?: string
  tool_input?: string
  tool_output?: string
  tags?: string[]
}): SpanRow {
  return makeSpanRow({
    trace_id: overrides.trace_id,
    span_id: overrides.span_id,
    session_id: overrides.session_id ?? "",
    start_time: overrides.start_time ?? "2026-03-15 12:00:02.000",
    end_time: overrides.end_time ?? "2026-03-15 12:00:03.000",
    name: `execute_tool ${overrides.tool_name}`,
    kind: 2,
    operation: "execute_tool",
    status_code: overrides.status_code ?? 1,
    error_type: overrides.error_type ?? "",
    status_message: overrides.status_message ?? "",
    tool_name: overrides.tool_name,
    tool_call_id: `call_${overrides.span_id.slice(0, 8)}`,
    tool_input: overrides.tool_input ?? "",
    tool_output: overrides.tool_output ?? "",
    tags: overrides.tags ?? [],
  })
}

const DEFS_JSON =
  '[{"name":"get_weather","description":"Get the weather","parameters":{}},' +
  '{"name":"unused_tool","description":"Never called","parameters":{"type":"object","properties":{"q":{"type":"string"}}}}]'

// ---------------------------------------------------------------------------
// listToolsWithMetrics
// ---------------------------------------------------------------------------

describe("listToolsWithMetrics", () => {
  const fixture = setupFixture()

  beforeEach(async () => {
    await fixture.insertSpans([
      // Trace t1 (session se1): chat offering [get_weather, unused_tool], one ok call.
      chatSpan({ trace_id: tid("t1"), span_id: sid("c1"), session_id: "se1", toolDefinitionsJson: DEFS_JSON }),
      callSpan({
        trace_id: tid("t1"),
        span_id: sid("u1"),
        session_id: "se1",
        tool_name: "get_weather",
        start_time: "2026-03-15 12:00:02.000",
        end_time: "2026-03-15 12:00:03.000", // 1s
      }),
      // Trace t2 (no session): chat offering the same tools, one failing call + an undefined tool call.
      chatSpan({ trace_id: tid("t2"), span_id: sid("c2"), toolDefinitionsJson: DEFS_JSON }),
      callSpan({
        trace_id: tid("t2"),
        span_id: sid("u2"),
        tool_name: "get_weather",
        status_code: 2,
        error_type: "TimeoutError",
        start_time: "2026-03-15 13:00:00.000",
        end_time: "2026-03-15 13:00:03.000", // 3s
      }),
      callSpan({ trace_id: tid("t2"), span_id: sid("u3"), tool_name: "mystery_tool" }),
      // Trace t3: no tool activity at all (counts toward totals only).
      chatSpan({ trace_id: tid("t3"), span_id: sid("c3") }),
      // Outside the time range — must be excluded everywhere.
      callSpan({
        trace_id: tid("t4"),
        span_id: sid("u4"),
        tool_name: "get_weather",
        start_time: "2026-04-10 12:00:00.000",
        end_time: "2026-04-10 12:00:01.000",
      }),
    ])
  })

  it("returns the union of defined and called tools", async () => {
    const result = await fixture.runCh(fixture.repo.listToolsWithMetrics(SCOPE))
    expect(result.tools.map((t) => t.name)).toEqual(["get_weather", "mystery_tool", "unused_tool"])

    const getWeather = result.tools[0]!
    expect(getWeather.metrics?.calls).toBe(2)
    expect(getWeather.offeredCount).toBe(2)

    // Called but never defined.
    const mystery = result.tools[1]!
    expect(mystery.metrics?.calls).toBe(1)
    expect(mystery.offeredCount).toBe(0)
    expect(mystery.selectionRate).toBeNull()
    expect(mystery.lastOffered).toBeNull()

    // Defined but never called.
    const unused = result.tools[2]!
    expect(unused.metrics).toBeNull()
    expect(unused.offeredCount).toBe(2)
    expect(unused.offeredTraces).toBe(2)
    expect(unused.selectionRate).toBe(0)
  })

  it("computes usage metrics, rates and totals", async () => {
    const result = await fixture.runCh(fixture.repo.listToolsWithMetrics(SCOPE))

    expect(result.totals.traces).toBe(3)
    expect(result.totals.sessions).toBe(1)
    expect(result.totals.tracesWithToolCalls).toBe(2)
    expect(result.totals.sessionsWithToolCalls).toBe(1)

    const metrics = result.tools[0]!.metrics!
    expect(metrics.calls).toBe(2)
    expect(metrics.errors).toBe(1)
    expect(metrics.errorRate).toBeCloseTo(0.5)
    expect(metrics.avgDurationNs).toBeCloseTo(2e9, -8) // (1s + 3s) / 2
    expect(metrics.tracesUsed).toBe(2)
    expect(metrics.sessionsUsed).toBe(1)
    expect(metrics.traceUsageRate).toBeCloseTo(2 / 3)
    expect(metrics.sessionUsageRate).toBeCloseTo(1)
    expect(metrics.firstSeen.toISOString()).toBe("2026-03-15T12:00:02.000Z")
    expect(metrics.lastUsed.toISOString()).toBe("2026-03-15T13:00:00.000Z")

    // 2 calls over 2 offers.
    expect(result.tools[0]!.selectionRate).toBeCloseTo(1)
  })

  it("returns empty analytics for a project with no spans", async () => {
    const result = await fixture.runCh(
      fixture.repo.listToolsWithMetrics({ ...SCOPE, projectId: ProjectId("empty-project-id-000000") }),
    )
    expect(result.tools).toEqual([])
    expect(result.totals).toEqual({ traces: 0, sessions: 0, tracesWithToolCalls: 0, sessionsWithToolCalls: 0 })
  })
})

// ---------------------------------------------------------------------------
// getToolDefinition
// ---------------------------------------------------------------------------

describe("getToolDefinition", () => {
  const fixture = setupFixture()

  it("preserves the definition verbatim, including empty parameters", async () => {
    await fixture.insertSpans([
      chatSpan({ trace_id: tid("t1"), span_id: sid("c1"), toolDefinitionsJson: DEFS_JSON }),
    ])
    const detail = await fixture.runCh(fixture.repo.getToolDefinition({ ...SCOPE, toolName: "get_weather" }))
    expect(detail).not.toBeNull()
    expect(detail!.definitionJson).toBe('{"name":"get_weather","description":"Get the weather","parameters":{}}')
    expect(detail!.definition).toEqual({
      name: "get_weather",
      description: "Get the weather",
      parameters: {},
    })
    expect(detail!.offeredCount).toBe(1)
    expect(detail!.offeredTraces).toBe(1)
  })

  it("returns the latest definition when it changed over time", async () => {
    const defAt = (description: string) => `[{"name":"evolving","description":"${description}","parameters":{}}]`
    await fixture.insertSpans([
      chatSpan({
        trace_id: tid("t1"),
        span_id: sid("c1"),
        start_time: "2026-03-10 08:00:00.000",
        toolDefinitionsJson: defAt("old"),
      }),
      chatSpan({
        trace_id: tid("t2"),
        span_id: sid("c2"),
        start_time: "2026-03-20 08:00:00.000",
        toolDefinitionsJson: defAt("new"),
      }),
    ])
    const detail = await fixture.runCh(fixture.repo.getToolDefinition({ ...SCOPE, toolName: "evolving" }))
    expect(detail!.definition?.description).toBe("new")
    expect(detail!.offeredCount).toBe(2)
    expect(detail!.lastOffered.toISOString()).toBe("2026-03-20T08:00:00.000Z")
  })

  it("returns null when the tool was never offered", async () => {
    await fixture.insertSpans([callSpan({ trace_id: tid("t1"), span_id: sid("u1"), tool_name: "mystery_tool" })])
    const detail = await fixture.runCh(fixture.repo.getToolDefinition({ ...SCOPE, toolName: "mystery_tool" }))
    expect(detail).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getToolUsageSummary
// ---------------------------------------------------------------------------

describe("getToolUsageSummary", () => {
  const fixture = setupFixture()

  it("aggregates calls for one tool", async () => {
    await fixture.insertSpans([
      chatSpan({ trace_id: tid("t1"), span_id: sid("c1"), session_id: "se1" }),
      callSpan({
        trace_id: tid("t1"),
        span_id: sid("u1"),
        session_id: "se1",
        tool_name: "search",
        start_time: "2026-03-15 12:00:00.000",
        end_time: "2026-03-15 12:00:01.000",
      }),
      callSpan({
        trace_id: tid("t2"),
        span_id: sid("u2"),
        tool_name: "search",
        status_code: 2,
        start_time: "2026-03-15 12:30:00.000",
        end_time: "2026-03-15 12:30:02.000",
      }),
      // Different tool — must not leak into the summary.
      callSpan({ trace_id: tid("t2"), span_id: sid("u3"), tool_name: "other" }),
    ])
    const summary = await fixture.runCh(fixture.repo.getToolUsageSummary({ ...SCOPE, toolName: "search" }))
    expect(summary!.calls).toBe(2)
    expect(summary!.errors).toBe(1)
    expect(summary!.tracesUsed).toBe(2)
    expect(summary!.sessionsUsed).toBe(1)
    expect(summary!.traceUsageRate).toBeCloseTo(1) // both project traces used it
  })

  it("returns null when the tool has no calls", async () => {
    await fixture.insertSpans([chatSpan({ trace_id: tid("t1"), span_id: sid("c1"), toolDefinitionsJson: DEFS_JSON })])
    const summary = await fixture.runCh(fixture.repo.getToolUsageSummary({ ...SCOPE, toolName: "unused_tool" }))
    expect(summary).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getToolCallHistogram
// ---------------------------------------------------------------------------

describe("getToolCallHistogram", () => {
  const fixture = setupFixture()

  beforeEach(async () => {
    await fixture.insertSpans([
      callSpan({
        trace_id: tid("t1"),
        span_id: sid("u1"),
        tool_name: "search",
        start_time: "2026-03-15 10:00:00.000",
        end_time: "2026-03-15 10:00:01.000",
      }),
      callSpan({
        trace_id: tid("t1"),
        span_id: sid("u2"),
        tool_name: "search",
        status_code: 2,
        start_time: "2026-03-15 10:30:00.000",
        end_time: "2026-03-15 10:30:01.000",
      }),
      callSpan({
        trace_id: tid("t2"),
        span_id: sid("u3"),
        tool_name: "lookup",
        start_time: "2026-03-15 11:10:00.000",
        end_time: "2026-03-15 11:10:01.000",
      }),
    ])
  })

  it("buckets calls for one tool", async () => {
    const buckets = await fixture.runCh(
      fixture.repo.getToolCallHistogram({ ...SCOPE, toolName: "search", bucketSeconds: 3600 }),
    )
    expect(buckets).toHaveLength(1)
    expect(buckets[0]!.bucketStart).toBe("2026-03-15T10:00:00.000Z")
    expect(buckets[0]!.calls).toBe(2)
    expect(buckets[0]!.errors).toBe(1)
  })

  it("aggregates across all tools when toolName is omitted", async () => {
    const buckets = await fixture.runCh(fixture.repo.getToolCallHistogram({ ...SCOPE, bucketSeconds: 3600 }))
    expect(buckets).toHaveLength(2)
    expect(buckets.map((b) => b.calls)).toEqual([2, 1])
  })
})

// ---------------------------------------------------------------------------
// getToolParameterStats
// ---------------------------------------------------------------------------

describe("getToolParameterStats", () => {
  const fixture = setupFixture()

  it("counts top-level keys and their most common values", async () => {
    await fixture.insertSpans([
      callSpan({
        trace_id: tid("t1"),
        span_id: sid("u1"),
        tool_name: "search",
        tool_input: '{"query":"weather","limit":10}',
      }),
      callSpan({
        trace_id: tid("t1"),
        span_id: sid("u2"),
        tool_name: "search",
        tool_input: '{"query":"weather","limit":20}',
      }),
      callSpan({ trace_id: tid("t2"), span_id: sid("u3"), tool_name: "search", tool_input: '{"query":"news"}' }),
      // Empty input — excluded from the sample.
      callSpan({ trace_id: tid("t2"), span_id: sid("u4"), tool_name: "search" }),
    ])
    const result = await fixture.runCh(fixture.repo.getToolParameterStats({ ...SCOPE, toolName: "search" }))
    expect(result.sampleSize).toBe(3)
    expect(result.stats[0]!.key).toBe("query")
    expect(result.stats[0]!.occurrences).toBe(3)
    expect(result.stats[0]!.topValues[0]).toEqual({ value: '"weather"', count: 2 })
    expect(result.stats[1]!.key).toBe("limit")
    expect(result.stats[1]!.occurrences).toBe(2)
  })

  it("returns empty stats when the tool records no inputs", async () => {
    await fixture.insertSpans([callSpan({ trace_id: tid("t1"), span_id: sid("u1"), tool_name: "search" })])
    const result = await fixture.runCh(fixture.repo.getToolParameterStats({ ...SCOPE, toolName: "search" }))
    expect(result.stats).toEqual([])
    expect(result.sampleSize).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// getToolContextBreakdown / getToolCoOccurrence
// ---------------------------------------------------------------------------

describe("tool context", () => {
  const fixture = setupFixture()

  beforeEach(async () => {
    await fixture.insertSpans([
      // Trace t1: gpt-4o chat + search & lookup calls (tags: prod).
      chatSpan({ trace_id: tid("t1"), span_id: sid("c1"), model: "gpt-4o", provider: "openai" }),
      callSpan({ trace_id: tid("t1"), span_id: sid("u1"), tool_name: "search", tags: ["prod"] }),
      callSpan({ trace_id: tid("t1"), span_id: sid("u2"), tool_name: "lookup" }),
      // Trace t2: claude chat + search call (tags: prod, beta).
      chatSpan({ trace_id: tid("t2"), span_id: sid("c2"), model: "claude-opus", provider: "anthropic" }),
      callSpan({ trace_id: tid("t2"), span_id: sid("u3"), tool_name: "search", tags: ["prod", "beta"] }),
      // Trace t3: gpt-4o chat without any search call — excluded from search's contexts.
      chatSpan({ trace_id: tid("t3"), span_id: sid("c3"), model: "gpt-4o", provider: "openai" }),
      callSpan({ trace_id: tid("t3"), span_id: sid("u4"), tool_name: "lookup" }),
    ])
  })

  it("breaks down models over the tool's traces", async () => {
    const rows = await fixture.runCh(
      fixture.repo.getToolContextBreakdown({ ...SCOPE, toolName: "search", dimension: "model" }),
    )
    expect(rows).toEqual([
      { value: "claude-opus", traces: 1, occurrences: 1 },
      { value: "gpt-4o", traces: 1, occurrences: 1 },
    ])
  })

  it("breaks down tags over the tool's own calls", async () => {
    const rows = await fixture.runCh(
      fixture.repo.getToolContextBreakdown({ ...SCOPE, toolName: "search", dimension: "tag" }),
    )
    expect(rows).toEqual([
      { value: "prod", traces: 2, occurrences: 2 },
      { value: "beta", traces: 1, occurrences: 1 },
    ])
  })

  it("finds co-occurring tools by shared traces", async () => {
    const rows = await fixture.runCh(fixture.repo.getToolCoOccurrence({ ...SCOPE, toolName: "search" }))
    expect(rows).toEqual([{ otherTool: "lookup", sharedTraces: 1 }])
  })
})

// ---------------------------------------------------------------------------
// listRecentToolCalls
// ---------------------------------------------------------------------------

describe("listRecentToolCalls", () => {
  const fixture = setupFixture()

  const callAt = (spanId: string, minute: number, overrides: Partial<Parameters<typeof callSpan>[0]> = {}) =>
    callSpan({
      trace_id: tid("t1"),
      span_id: sid(spanId),
      tool_name: "search",
      start_time: `2026-03-15 12:${String(minute).padStart(2, "0")}:00.000`,
      end_time: `2026-03-15 12:${String(minute).padStart(2, "0")}:01.000`,
      ...overrides,
    })

  it("returns newest calls first and paginates with the cursor", async () => {
    await fixture.insertSpans([
      callAt("u1", 1, { tool_input: '{"q":"a"}' }),
      callAt("u2", 2, { tool_input: '{"q":"b"}' }),
      callAt("u3", 3, { tool_input: '{"q":"c"}' }),
    ])

    const page1 = await fixture.runCh(fixture.repo.listRecentToolCalls({ ...SCOPE, toolName: "search", limit: 2 }))
    expect(page1.items.map((i) => i.toolInput)).toEqual(['{"q":"c"}', '{"q":"b"}'])
    expect(page1.hasMore).toBe(true)
    expect(page1.nextCursor).toBeDefined()

    const page2 = await fixture.runCh(
      fixture.repo.listRecentToolCalls({ ...SCOPE, toolName: "search", limit: 2, cursor: page1.nextCursor! }),
    )
    expect(page2.items.map((i) => i.toolInput)).toEqual(['{"q":"a"}'])
    expect(page2.hasMore).toBe(false)
  })

  it("dedupes re-ingested spans, newest ingestion wins", async () => {
    await fixture.insertSpans([callAt("u1", 1, { tool_input: '{"v":"old"}' })])
    await new Promise((resolve) => setTimeout(resolve, 10))
    await fixture.insertSpans([callAt("u1", 1, { tool_input: '{"v":"new"}' })])

    const page = await fixture.runCh(fixture.repo.listRecentToolCalls({ ...SCOPE, toolName: "search" }))
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.toolInput).toBe('{"v":"new"}')
  })

  it("filters to errors and maps status fields", async () => {
    await fixture.insertSpans([
      callAt("u1", 1),
      callAt("u2", 2, { status_code: 2, error_type: "TimeoutError", status_message: "timed out" }),
    ])
    const page = await fixture.runCh(
      fixture.repo.listRecentToolCalls({ ...SCOPE, toolName: "search", errorsOnly: true }),
    )
    expect(page.items).toHaveLength(1)
    expect(page.items[0]!.statusCode).toBe("error")
    expect(page.items[0]!.errorType).toBe("TimeoutError")
    expect(page.items[0]!.statusMessage).toBe("timed out")
  })

  it("truncates oversized payloads and flags them", async () => {
    const bigValue = "x".repeat(5_000)
    await fixture.insertSpans([callAt("u1", 1, { tool_input: `{"blob":"${bigValue}"}` })])
    const page = await fixture.runCh(fixture.repo.listRecentToolCalls({ ...SCOPE, toolName: "search" }))
    expect(page.items[0]!.toolInputTruncated).toBe(true)
    expect(page.items[0]!.toolInput.length).toBe(4_096)
    expect(page.items[0]!.toolOutputTruncated).toBe(false)
  })
})
