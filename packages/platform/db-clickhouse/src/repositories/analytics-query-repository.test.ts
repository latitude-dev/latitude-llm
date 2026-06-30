import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { type AnalyticsQueryInput, AnalyticsQueryReader, type AnalyticsQueryReaderShape } from "@domain/spans"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { AnalyticsQueryReaderLive } from "./analytics-query-repository.ts"

const ORG_ID = OrganizationId("o".repeat(24))
// Own project so fixtures from other suites can't leak into the aggregates.
const PROJECT_ID = ProjectId("analyticsquery0000000000")

const toCh = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")
const traceId = (n: number) => `aq${n}`.padEnd(32, "0")
const spanId = (n: number) => `aq${n}`.padEnd(16, "0")

/** One span per trace, so the trace's start_time / models / error_count are exactly the span's. */
const span = (
  n: number,
  startTime: Date,
  opts: { model?: string; statusCode?: number; sessionId?: string } = {},
): SpanRow =>
  ({
    organization_id: ORG_ID,
    project_id: PROJECT_ID,
    session_id: opts.sessionId ?? "",
    user_id: "",
    trace_id: traceId(n),
    span_id: spanId(n),
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: toCh(startTime),
    end_time: toCh(new Date(startTime.getTime() + 1_000)),
    name: "aq-span",
    service_name: "aq-service",
    kind: 0,
    status_code: opts.statusCode ?? 0,
    status_message: "",
    error_type: "",
    tags: [],
    metadata: {},
    operation: "chat",
    provider: "",
    model: opts.model ?? "",
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
  }) satisfies SpanRow

// Trace-breakdown fixtures, all on 2026-06-01: three gpt-4o-mini traces (one
// errored) + one gpt-4o trace. Session fixtures live on 2026-06-02.
const DAY1 = new Date("2026-06-01T10:00:00.000Z")
const day1From = new Date("2026-06-01T00:00:00.000Z")
const day1To = new Date("2026-06-02T00:00:00.000Z")
const day2From = day1To
const day2To = new Date("2026-06-03T00:00:00.000Z")

const ch = setupTestClickHouse()
const baseInput = {
  organizationId: ORG_ID,
  projectId: PROJECT_ID,
  filterSet: {},
  query: null,
  orderBy: { by: "value", direction: "desc" },
  limit: 50,
} as const

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

describe("AnalyticsQueryReaderLive (traces)", () => {
  let reader: AnalyticsQueryReaderShape

  beforeAll(async () => {
    reader = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* AnalyticsQueryReader
      }).pipe(Effect.provide(AnalyticsQueryReaderLive)),
    )
    expect(reader).toBeDefined()
  })

  const run = (input: AnalyticsQueryInput) => runCh(reader.query(input))

  beforeEach(async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        span(1, DAY1, { model: "gpt-4o-mini" }),
        span(2, DAY1, { model: "gpt-4o-mini" }),
        span(3, DAY1, { model: "gpt-4o-mini", statusCode: 2 }),
        span(4, DAY1, { model: "gpt-4o" }),
        span(5, new Date("2026-06-02T10:00:00.000Z"), { model: "gpt-4o", sessionId: "aq-session-1" }),
        span(6, new Date("2026-06-02T11:00:00.000Z"), { model: "gpt-4o", sessionId: "aq-session-2" }),
      ]),
    )
  })

  const tracesInput = (extra: Partial<AnalyticsQueryInput>): AnalyticsQueryInput => ({
    ...baseInput,
    stream: "traces",
    metric: { kind: "count" },
    from: day1From,
    to: day1To,
    ...extra,
  })

  it("breaks count down by model via ARRAY JOIN, ranked by value", async () => {
    const series = await run(tracesInput({ breakdown: "model" }))
    expect(series).toEqual([
      { key: "gpt-4o-mini", value: 3 },
      { key: "gpt-4o", value: 1 },
    ])
  })

  it("breaks count down by the scalar `status` expression", async () => {
    const series = await run(tracesInput({ breakdown: "status" }))
    expect(series).toEqual([
      { key: "success", value: 3 },
      { key: "error", value: 1 },
    ])
  })

  it("computes a single errorRate when there is no breakdown (as a 0–1 ratio)", async () => {
    const series = await run(tracesInput({ metric: { kind: "errorRate" } }))
    expect(series).toHaveLength(1)
    // 1 of 4 traces errored → 0.25. Rates stay a 0–1 ratio (not a percent).
    expect(series[0]?.value).toBeCloseTo(0.25, 5)
  })

  it("computes errorRate per breakdown value (as a 0–1 ratio)", async () => {
    const series = await run(tracesInput({ metric: { kind: "errorRate" }, breakdown: "model" }))
    const byKey = Object.fromEntries(series.map((p) => [p.key, p.value]))
    expect(byKey["gpt-4o-mini"]).toBeCloseTo(1 / 3, 5)
    expect(byKey["gpt-4o"]).toBeCloseTo(0, 5)
  })

  it("returns duration in seconds, not nanoseconds", async () => {
    // Each fixture span is 1000ms, so every trace's duration is exactly 1s.
    const series = await run(tracesInput({ metric: { kind: "avg", field: "duration" } }))
    expect(series).toHaveLength(1)
    expect(series[0]?.value).toBeCloseTo(1, 5)
  })

  it("honors the row limit on a breakdown", async () => {
    const series = await run(tracesInput({ breakdown: "model", limit: 1 }))
    expect(series).toEqual([{ key: "gpt-4o-mini", value: 3 }])
  })

  it("buckets a metric over time", async () => {
    const series = await run(tracesInput({ timeBucket: { unit: "day", size: 1 } }))
    expect(series).toEqual([{ bucketStart: "2026-06-01T00:00:00Z", value: 4 }])
  })

  it("fails on an unknown breakdown field", async () => {
    await expect(run(tracesInput({ breakdown: "country" }))).rejects.toBeDefined()
  })

  it("counts sessions on the sessions stream", async () => {
    const series = await run({
      ...baseInput,
      stream: "sessions",
      metric: { kind: "count" },
      from: day2From,
      to: day2To,
    })
    expect(series).toEqual([{ value: 2 }])
  })

  it("breaks sessions down by model", async () => {
    const series = await run({
      ...baseInput,
      stream: "sessions",
      metric: { kind: "count" },
      breakdown: "model",
      from: day2From,
      to: day2To,
    })
    expect(series).toEqual([{ key: "gpt-4o", value: 2 }])
  })

  it("breaks spans down by the span-only `operation` dimension", async () => {
    const series = await run({
      ...baseInput,
      stream: "spans",
      metric: { kind: "count" },
      breakdown: "operation",
      from: day1From,
      to: day1To,
    })
    // All seeded spans use operation "chat".
    expect(series).toEqual([{ key: "chat", value: 4 }])
  })
})
