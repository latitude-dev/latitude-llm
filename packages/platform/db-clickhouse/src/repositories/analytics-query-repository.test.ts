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
  opts: { model?: string; statusCode?: number; sessionId?: string; durationMs?: number } = {},
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
    end_time: toCh(new Date(startTime.getTime() + (opts.durationMs ?? 1_000))),
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
// Day 3 holds three traces of distinct duration (1s / 2s / 3s) so min/max/median/avg
// are all distinguishable.
const DAY3 = new Date("2026-06-03T10:00:00.000Z")
const day3From = day2To
const day3To = new Date("2026-06-04T00:00:00.000Z")
// Day 5 holds the score fixtures (the signal grain). `created_at` is a DateTime64(3).
const day5From = new Date("2026-06-05T00:00:00.000Z")
const day5To = new Date("2026-06-06T00:00:00.000Z")
const toCh3 = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")
// Day 7 holds the behavior fixtures (taxonomy observations).
const DAY7 = new Date("2026-06-07T10:00:00.000Z")
const day7From = new Date("2026-06-07T00:00:00.000Z")
const day7To = new Date("2026-06-08T00:00:00.000Z")
// Day 9 holds the moment fixtures (semantic-moment labels joined to their moment).
const DAY9 = new Date("2026-06-09T10:00:00.000Z")
const day9From = new Date("2026-06-09T00:00:00.000Z")
const day9To = new Date("2026-06-10T00:00:00.000Z")
const MOMENT_HASH = "c".repeat(64)

const behavior = (n: number, opts: { cluster: string; confidence: number; method?: string }) => ({
  organization_id: ORG_ID as string,
  project_id: PROJECT_ID as string,
  observation_id: `aqobs${n}`.padEnd(24, "0"),
  session_id: "aq-behavior-session",
  analysis_hash: "a".repeat(64),
  moment_id: `m${n}`,
  projection_method: "umap",
  projection_hash: "b".repeat(64),
  embedding: [],
  assigned_cluster_id: opts.cluster,
  assignment_confidence: opts.confidence,
  assignment_method: opts.method ?? "auto",
  start_time: toCh(DAY7),
  end_time: toCh(DAY7),
})

// A semantic moment (carries start_time + coherence_score, joined by the label).
const semanticMoment = (n: number, opts: { coherence: number }) => ({
  organization_id: ORG_ID as string,
  project_id: PROJECT_ID as string,
  session_id: "aq-moment-session",
  analysis_hash: MOMENT_HASH,
  moment_id: `mom${n}`,
  trace_id: traceId(n),
  start_time: toCh(DAY9),
  end_time: toCh(DAY9),
  first_message_index: 0,
  last_message_index: 1,
  boundary_reason: "topic_shift",
  embedding: [],
  coherence_score: opts.coherence,
})

// A moment label (kind/actor-tagged), joined to its moment on (session, hash, moment).
const momentLabel = (n: number, opts: { kind: string; actor: string; confidence: number }) => ({
  organization_id: ORG_ID as string,
  project_id: PROJECT_ID as string,
  session_id: "aq-moment-session",
  analysis_hash: MOMENT_HASH,
  label_id: `lbl${n}`,
  moment_id: `mom${n}`,
  kind: opts.kind,
  actor: opts.actor,
  first_message_index: 0,
  last_message_index: 1,
  summary: "",
  evidence: "",
  confidence: opts.confidence,
})

const score = (
  n: number,
  opts: { signalId: string; value: number; passed: boolean; errored?: boolean; traceId?: string },
) => ({
  id: `aqscore${n}`.padEnd(24, "0"),
  organization_id: ORG_ID as string,
  project_id: PROJECT_ID as string,
  session_id: "",
  trace_id: opts.traceId ?? "",
  span_id: "",
  source: "evaluation",
  source_id: "eval_src_000000000000",
  simulation_id: "",
  signal_id: opts.signalId,
  value: opts.value,
  passed: opts.passed,
  errored: opts.errored ?? false,
  duration: 0,
  tokens: 0,
  cost: 0,
  created_at: toCh3(new Date("2026-06-05T10:00:00.000Z")),
})

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
        span(7, DAY3, { durationMs: 1_000 }),
        span(8, DAY3, { durationMs: 2_000 }),
        span(9, DAY3, { durationMs: 3_000 }),
      ]),
    )
    // Scores (signal grain): sig-a on two gpt-4o-mini traces, sig-b on a gpt-4o
    // trace + one trace-less score. 2 passed / 1 errored → passRate .5, errorRate .25.
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "scores", [
        score(1, { signalId: "sig-a", value: 0.2, passed: false, traceId: traceId(1) }),
        score(2, { signalId: "sig-a", value: 0.4, passed: true, traceId: traceId(2) }),
        score(3, { signalId: "sig-b", value: 0.6, passed: true, traceId: traceId(4) }),
        score(4, { signalId: "sig-b", value: 0.0, passed: false, errored: true }),
      ]),
    )
    // Behaviors (taxonomy observations): clA×2 (conf 0.8/0.6), clB×1 (0.4) → avg 0.6.
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "taxonomy_observations", [
        behavior(1, { cluster: "clA", confidence: 0.8 }),
        behavior(2, { cluster: "clA", confidence: 0.6 }),
        behavior(3, { cluster: "clB", confidence: 0.4 }),
      ]),
    )
    // Moments: 3 labels, one per moment. kind frequency×2 / escalation×1;
    // confidence 0.8/0.6/0.4 → avg 0.6; coherence 0.9/0.7/0.5 → avg 0.7.
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "session_semantic_moments", [
        semanticMoment(1, { coherence: 0.9 }),
        semanticMoment(2, { coherence: 0.7 }),
        semanticMoment(3, { coherence: 0.5 }),
      ]),
    )
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "session_moment_labels", [
        momentLabel(1, { kind: "frequency", actor: "user", confidence: 0.8 }),
        momentLabel(2, { kind: "frequency", actor: "assistant", confidence: 0.6 }),
        momentLabel(3, { kind: "escalation", actor: "user", confidence: 0.4 }),
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

  it("computes min/max/median/avg over duration (in seconds), plus an arbitrary percentile", async () => {
    // Day 3 has three traces of 1s / 2s / 3s.
    const base = { ...baseInput, stream: "traces" as const, from: day3From, to: day3To }
    const value = async (kind: "min" | "max" | "median" | "avg") =>
      (await run({ ...base, metric: { kind, field: "duration" } }))[0]?.value
    expect(await value("min")).toBeCloseTo(1, 5)
    expect(await value("max")).toBeCloseTo(3, 5)
    expect(await value("median")).toBeCloseTo(2, 5)
    expect(await value("avg")).toBeCloseTo(2, 5)
    const p95 = (await run({ ...base, metric: { kind: "percentile", field: "duration", p: 95 } }))[0]?.value
    expect(p95).toBeCloseTo(3, 5)
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

  const scoresInput = (extra: Partial<AnalyticsQueryInput>): AnalyticsQueryInput => ({
    ...baseInput,
    stream: "scores",
    metric: { kind: "count" },
    from: day5From,
    to: day5To,
    ...extra,
  })

  it("counts score occurrences (signal grain)", async () => {
    expect(await run(scoresInput({}))).toEqual([{ value: 4 }])
  })

  it("breaks scores down by signalId", async () => {
    const byKey = Object.fromEntries((await run(scoresInput({ breakdown: "signalId" }))).map((p) => [p.key, p.value]))
    expect(byKey).toEqual({ "sig-a": 2, "sig-b": 2 })
  })

  it("computes avg(value) / passRate / errorRate over scores (0–1, unscaled)", async () => {
    expect((await run(scoresInput({ metric: { kind: "avg", field: "value" } })))[0]?.value).toBeCloseTo(0.3, 5)
    expect((await run(scoresInput({ metric: { kind: "passRate" } })))[0]?.value).toBeCloseTo(0.5, 5)
    expect((await run(scoresInput({ metric: { kind: "errorRate" } })))[0]?.value).toBeCloseTo(0.25, 5)
  })

  it("breaks scores down by a trace dim (model) via the score's trace", async () => {
    const byKey = Object.fromEntries((await run(scoresInput({ breakdown: "model" }))).map((p) => [p.key, p.value]))
    // sig-a scores on two gpt-4o-mini traces, one sig-b score on a gpt-4o trace;
    // the trace-less score drops out of the trace-dim breakdown.
    expect(byKey).toEqual({ "gpt-4o-mini": 2, "gpt-4o": 1 })
  })

  const behaviorsInput = (extra: Partial<AnalyticsQueryInput>): AnalyticsQueryInput => ({
    ...baseInput,
    stream: "behaviors",
    metric: { kind: "count" },
    from: day7From,
    to: day7To,
    ...extra,
  })

  it("counts behaviors and breaks them down by cluster", async () => {
    expect(await run(behaviorsInput({}))).toEqual([{ value: 3 }])
    const byKey = Object.fromEntries((await run(behaviorsInput({ breakdown: "cluster" }))).map((p) => [p.key, p.value]))
    expect(byKey).toEqual({ clA: 2, clB: 1 })
  })

  it("computes avg(confidence) over behaviors (0–1, unscaled)", async () => {
    expect((await run(behaviorsInput({ metric: { kind: "avg", field: "confidence" } })))[0]?.value).toBeCloseTo(0.6, 5)
  })

  const momentsInput = (extra: Partial<AnalyticsQueryInput>): AnalyticsQueryInput => ({
    ...baseInput,
    stream: "moments",
    metric: { kind: "count" },
    from: day9From,
    to: day9To,
    ...extra,
  })

  it("counts moment labels and breaks them down by kind", async () => {
    expect(await run(momentsInput({}))).toEqual([{ value: 3 }])
    const byKey = Object.fromEntries((await run(momentsInput({ breakdown: "kind" }))).map((p) => [p.key, p.value]))
    expect(byKey).toEqual({ frequency: 2, escalation: 1 })
  })

  it("computes avg(confidence) from the label and avg(coherence) from the joined moment (0–1, unscaled)", async () => {
    expect((await run(momentsInput({ metric: { kind: "avg", field: "confidence" } })))[0]?.value).toBeCloseTo(0.6, 5)
    expect((await run(momentsInput({ metric: { kind: "avg", field: "coherence" } })))[0]?.value).toBeCloseTo(0.7, 5)
  })
})
