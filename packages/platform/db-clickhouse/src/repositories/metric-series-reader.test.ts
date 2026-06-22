import { MetricSeriesReader, type MetricSeriesReaderShape, type MetricSeriesTarget } from "@domain/monitors"
import { type ChSqlClient, type FilterSet, OrganizationId, ProjectId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { MetricSeriesReaderLive } from "./metric-series-reader.ts"

const ORG_ID = OrganizationId("o".repeat(24))
// A project of its own so seeded fixtures from other suites can't leak into the counts.
const PROJECT_ID = ProjectId("metricseriesreader000000")
const TAG = "ms-count"

const toCh = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")

// trace_id / span_id are fixed-width columns (32 / 16 chars); pad to fit.
const traceId = (n: number) => `tr${n}`.padEnd(32, "0")
const spanId = (n: number) => `sp${n}`.padEnd(16, "0")

// One span per trace, so `start_time` (min over the trace) is exactly the span's.
const span = (n: number, startTime: Date, tags: readonly string[] = [TAG], durationMs = 1_000): SpanRow =>
  ({
    organization_id: ORG_ID,
    project_id: PROJECT_ID,
    session_id: "",
    user_id: "",
    trace_id: traceId(n),
    span_id: spanId(n),
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: toCh(startTime),
    end_time: toCh(new Date(startTime.getTime() + durationMs)),
    name: "ms-count-span",
    service_name: "ms-count-service",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [...tags],
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
  }) satisfies SpanRow

const t0930 = new Date("2026-06-01T09:30:00.000Z")
const t10 = new Date("2026-06-01T10:00:00.000Z")
const t1030 = new Date("2026-06-01T10:30:00.000Z")
const t11 = new Date("2026-06-01T11:00:00.000Z")
// Aggregate-metric fixtures live in their own windows so they can't perturb the
// count/bucket assertions above regardless of test ordering.
const t12 = new Date("2026-06-01T12:00:00.000Z")
const t13 = new Date("2026-06-01T13:00:00.000Z")
const t15 = new Date("2026-06-01T15:00:00.000Z")
const t16 = new Date("2026-06-01T16:00:00.000Z")
const t18 = new Date("2026-06-01T18:00:00.000Z")
const t19 = new Date("2026-06-01T19:00:00.000Z")
const t20 = new Date("2026-06-01T20:00:00.000Z")
const t21 = new Date("2026-06-01T21:00:00.000Z")

// A span carrying prompt-cache token counts, for the cacheHitRate metric.
const cacheSpan = (
  n: number,
  startTime: Date,
  tokens: { input: number; cacheRead: number; cacheCreate: number },
  operation = "",
): SpanRow => ({
  ...span(n, startTime, [TAG]),
  operation,
  tokens_input: tokens.input,
  tokens_cache_read: tokens.cacheRead,
  tokens_cache_create: tokens.cacheCreate,
})

/** A `traces` + `count` target — the saved-search/match shape this reader supersedes. */
const countTarget = (filterSet: FilterSet = {}, query: string | null = null): MetricSeriesTarget => ({
  stream: "traces",
  filterSet,
  query,
  metric: { kind: "count" },
})

/** A `traces` target carrying an arbitrary metric (no filter / no query). */
const metricTarget = (metric: MetricSeriesTarget["metric"]): MetricSeriesTarget => ({
  stream: "traces",
  filterSet: {},
  query: null,
  metric,
})

/** A `spans` target carrying a metric + row-local filter (the tool-monitor shape). */
const spanTarget = (metric: MetricSeriesTarget["metric"], filterSet: FilterSet): MetricSeriesTarget => ({
  stream: "spans",
  filterSet,
  query: null,
  metric,
})

/** A `sessions` target carrying an arbitrary metric (no filter / no query). */
const sessionTarget = (metric: MetricSeriesTarget["metric"]): MetricSeriesTarget => ({
  stream: "sessions",
  filterSet: {},
  query: null,
  metric,
})

// span() defaults to status_code 0 / 1s; override duration via its arg and status inline.
const errorSpan = (n: number, startTime: Date, durationMs: number): SpanRow => ({
  ...span(n, startTime, [TAG], durationMs),
  status_code: 2,
})

// An `execute_tool` span for one named tool (the spans-stream fixture shape).
const toolSpan = (
  n: number,
  startTime: Date,
  toolName: string,
  opts: { durationMs?: number; statusCode?: number } = {},
): SpanRow => ({
  ...span(n, startTime, [TAG], opts.durationMs ?? 1_000),
  operation: "execute_tool",
  tool_name: toolName,
  status_code: opts.statusCode ?? 0,
})

const ch = setupTestClickHouse()
const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

describe("MetricSeriesReaderLive (traces / count)", () => {
  let reader: MetricSeriesReaderShape

  beforeAll(async () => {
    reader = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* MetricSeriesReader
      }).pipe(Effect.provide(MetricSeriesReaderLive)),
    )
  })

  beforeEach(async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [span(1, t10), span(2, t1030), span(3, t11), span(4, t1030, ["other"])]),
    )
  })

  const target = countTarget()

  it("counts only traces whose start_time falls in [from, to)", async () => {
    // [10:00, 11:00) includes t10 + t1030 (and the 'other'-tagged trace at t1030); excludes t11.
    const count = await runCh(
      reader.valueInWindow({ organizationId: ORG_ID, projectId: PROJECT_ID, target, from: t10, to: t11 }),
    )
    expect(count).toBe(3)
  })

  it("excludes the lower bound's predecessor and the upper bound itself", async () => {
    const count = await runCh(
      reader.valueInWindow({ organizationId: ORG_ID, projectId: PROJECT_ID, target, from: t1030, to: t11 }),
    )
    expect(count).toBe(2)
  })

  it("returns the earliest matching trace start_time", async () => {
    const first = await runCh(
      reader.firstEventAt({ organizationId: ORG_ID, projectId: PROJECT_ID, target, from: t10, to: t11 }),
    )
    expect(first).toEqual(t10)
  })

  it("returns null when no trace matches the window", async () => {
    const first = await runCh(
      reader.firstEventAt({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        target,
        from: new Date("2026-06-01T12:00:00.000Z"),
        to: new Date("2026-06-01T13:00:00.000Z"),
      }),
    )
    expect(first).toBeNull()
  })

  it("returns the latest matching trace start_time", async () => {
    // [10:00, 11:00) includes t10 + t1030; t11 == the exclusive upper bound is excluded ⇒ latest is t1030.
    const last = await runCh(
      reader.lastEventAt({ organizationId: ORG_ID, projectId: PROJECT_ID, target, from: t10, to: t11 }),
    )
    expect(last).toEqual(t1030)
  })

  it("returns null from lastEventAt when no trace matches the window", async () => {
    const last = await runCh(
      reader.lastEventAt({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        target,
        from: new Date("2026-06-01T12:00:00.000Z"),
        to: new Date("2026-06-01T13:00:00.000Z"),
      }),
    )
    expect(last).toBeNull()
  })

  it("applies the saved search's structured filters", async () => {
    const tagged = countTarget({ tags: [{ op: "in", value: [TAG] }] })
    const count = await runCh(
      reader.valueInWindow({ organizationId: ORG_ID, projectId: PROJECT_ID, target: tagged, from: t10, to: t11 }),
    )
    // Drops the 'other'-tagged trace → t10 + t1030 only.
    expect(count).toBe(2)
  })

  it("resolves gtePercentile filters against the project distribution instead of failing", async () => {
    // Two slow traces (100s) on top of the four seeded 1s ones; p90 of the
    // per-trace duration distribution lands between 1s and 100s, so the
    // resolved `gte` keeps only the slow pair.
    // n = 5/6: `traceId` pads with zeros, so e.g. `traceId(10)` would collide with `traceId(1)`.
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [span(5, t1030, [TAG], 100_000), span(6, t1030, [TAG], 100_000)]),
    )

    const slow = countTarget({ duration: [{ op: "gtePercentile", value: 90 }] })
    const count = await runCh(
      reader.valueInWindow({ organizationId: ORG_ID, projectId: PROJECT_ID, target: slow, from: t10, to: t11 }),
    )
    expect(count).toBe(2)
  })

  it("buckets matches newest-first, zero-filled, aligned to `to`", async () => {
    // [09:30, 11:00) tiled into 3×30-min buckets aligned to 11:00 (newest-first):
    //   idx 0 = (10:30, 11:00) → empty (t11 == `to` is excluded)
    //   idx 1 = (10:00, 10:30] → t1030 (+ the 'other'-tagged trace, no filter applied) → 2
    //   idx 2 = (09:30, 10:00] → t10 → 1
    const counts = await runCh(
      reader.seriesPerBucket({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        target,
        from: t0930,
        to: t11,
        bucketMs: 30 * 60 * 1000,
      }),
    )
    expect(counts).toEqual([0, 2, 1])
  })

  it("honours the structured filters per bucket", async () => {
    const tagged = countTarget({ tags: [{ op: "in", value: [TAG] }] })
    const counts = await runCh(
      reader.seriesPerBucket({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        target: tagged,
        from: t0930,
        to: t11,
        bucketMs: 30 * 60 * 1000,
      }),
    )
    // The 'other'-tagged trace at 10:30 is dropped by the tag filter → idx 1 falls to 1.
    expect(counts).toEqual([0, 1, 1])
  })

  it("computes errorRate / avg / sum over the matched traces", async () => {
    // [12:00, 13:00): three traces of 2s / 4s / 6s, the 6s one errored.
    // Ids 41/42/43: padEnd-collision-safe (no n↔10n overlap with the seeded 1–6).
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        span(41, t12, [TAG], 2_000),
        span(42, t12, [TAG], 4_000),
        errorSpan(43, t12, 6_000),
      ]),
    )
    const window = { organizationId: ORG_ID, projectId: PROJECT_ID, from: t12, to: t13 }

    const errorRate = await runCh(reader.valueInWindow({ ...window, target: metricTarget({ kind: "errorRate" }) }))
    expect(errorRate).toBeCloseTo(1 / 3)

    const avg = await runCh(
      reader.valueInWindow({ ...window, target: metricTarget({ kind: "avg", field: "duration" }) }),
    )
    expect(avg).toBe(4_000_000_000) // (2+4+6)/3 s, in ns

    const sum = await runCh(
      reader.valueInWindow({ ...window, target: metricTarget({ kind: "sum", field: "duration" }) }),
    )
    expect(sum).toBe(12_000_000_000) // (2+4+6) s, in ns
  })

  it("reads 0 (not nan) for a ratio/aggregate over an empty window", async () => {
    const empty = {
      organizationId: ORG_ID,
      projectId: PROJECT_ID,
      from: new Date("2026-06-02T00:00:00.000Z"),
      to: new Date("2026-06-02T01:00:00.000Z"),
    }
    expect(await runCh(reader.valueInWindow({ ...empty, target: metricTarget({ kind: "errorRate" }) }))).toBe(0)
    expect(
      await runCh(reader.valueInWindow({ ...empty, target: metricTarget({ kind: "avg", field: "duration" }) })),
    ).toBe(0)
  })

  it("computes a token-weighted cacheHitRate over the matched traces", async () => {
    // [18:00, 19:00): two traces. cache_read 80 + 20; input 10 + 80; cache_create 10 + 0.
    // ratio = (80+20) / ((10+80) + (80+20) + (10+0)) = 100 / 200 = 0.5. The trace
    // rollup only sums usage-operation tokens, so these must be `chat` spans.
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        cacheSpan(81, t18, { input: 10, cacheRead: 80, cacheCreate: 10 }, "chat"),
        cacheSpan(82, t18, { input: 80, cacheRead: 20, cacheCreate: 0 }, "chat"),
      ]),
    )
    const rate = await runCh(
      reader.valueInWindow({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        from: t18,
        to: t19,
        target: metricTarget({ kind: "cacheHitRate" }),
      }),
    )
    expect(rate).toBeCloseTo(0.5)
  })

  it("reads 0 (not nan) for cacheHitRate when matched traces have no input-side tokens", async () => {
    // span() defaults every token field to 0 ⇒ denominator 0 ⇒ guarded to 0.
    await Effect.runPromise(insertJsonEachRow(ch.client, "spans", [span(84, t19)]))
    const rate = await runCh(
      reader.valueInWindow({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        from: t19,
        to: t20,
        target: metricTarget({ kind: "cacheHitRate" }),
      }),
    )
    expect(rate).toBe(0)
  })

  it("computes a token-weighted cacheHitRate over the matched sessions", async () => {
    // [20:00, 21:00): two orphan spans roll up to two sessions whose cache tokens sum the
    // same way as the traces case — ratio = (80+20) / ((10+80)+(80+20)+(10+0)) = 100 / 200 = 0.5.
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        cacheSpan(85, t20, { input: 10, cacheRead: 80, cacheCreate: 10 }, "chat"),
        cacheSpan(86, t20, { input: 80, cacheRead: 20, cacheCreate: 0 }, "chat"),
      ]),
    )
    const rate = await runCh(
      reader.valueInWindow({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        from: t20,
        to: t21,
        target: sessionTarget({ kind: "cacheHitRate" }),
      }),
    )
    expect(rate).toBeCloseTo(0.5)
  })

  // ── spans stream (per tool-call) ────────────────────────────────────────────
  const EXECUTE_TOOL = { operation: [{ op: "eq" as const, value: "execute_tool" }] }

  it("counts execute_tool spans, scoped by tool name", async () => {
    // [15:00, 16:00): three `search` calls + one `fetch` call.
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        toolSpan(61, t15, "search", { durationMs: 2_000 }),
        toolSpan(62, t15, "search", { durationMs: 4_000 }),
        toolSpan(63, t15, "search", { durationMs: 6_000, statusCode: 2 }),
        toolSpan(64, t15, "fetch", { durationMs: 1_000 }),
      ]),
    )
    const window = { organizationId: ORG_ID, projectId: PROJECT_ID, from: t15, to: t16 }

    const allTools = await runCh(
      reader.valueInWindow({ ...window, target: spanTarget({ kind: "count" }, EXECUTE_TOOL) }),
    )
    expect(allTools).toBe(4)

    const searchOnly = await runCh(
      reader.valueInWindow({
        ...window,
        target: spanTarget({ kind: "count" }, { ...EXECUTE_TOOL, toolName: [{ op: "eq", value: "search" }] }),
      }),
    )
    expect(searchOnly).toBe(3)
  })

  it("computes errorRate / avg / sum per tool call", async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        toolSpan(61, t15, "search", { durationMs: 2_000 }),
        toolSpan(62, t15, "search", { durationMs: 4_000 }),
        toolSpan(63, t15, "search", { durationMs: 6_000, statusCode: 2 }),
      ]),
    )
    const window = { organizationId: ORG_ID, projectId: PROJECT_ID, from: t15, to: t16 }
    const filter = { ...EXECUTE_TOOL, toolName: [{ op: "eq" as const, value: "search" }] }

    expect(
      await runCh(reader.valueInWindow({ ...window, target: spanTarget({ kind: "errorRate" }, filter) })),
    ).toBeCloseTo(1 / 3)
    expect(
      await runCh(reader.valueInWindow({ ...window, target: spanTarget({ kind: "avg", field: "duration" }, filter) })),
    ).toBe(4_000_000_000)
    expect(
      await runCh(reader.valueInWindow({ ...window, target: spanTarget({ kind: "sum", field: "duration" }, filter) })),
    ).toBe(12_000_000_000)
  })

  it("computes cacheHitRate over usage spans, ignoring non-usage operations", async () => {
    // [20:00, 21:00): a `chat` span (input 10, cache_read 80, cache_create 10) and an
    // `execute_tool` span whose tokens are gated out — the tool span's 1000 input
    // tokens must not enter the denominator. ratio = 80 / (10 + 80 + 10) = 0.8
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        cacheSpan(91, t20, { input: 10, cacheRead: 80, cacheCreate: 10 }, "chat"),
        cacheSpan(92, t20, { input: 1_000, cacheRead: 0, cacheCreate: 0 }, "execute_tool"),
      ]),
    )
    const rate = await runCh(
      reader.valueInWindow({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        from: t20,
        to: t21,
        target: spanTarget({ kind: "cacheHitRate" }, {}),
      }),
    )
    expect(rate).toBeCloseTo(0.8)
  })

  it("buckets tool calls newest-first over the spans stream", async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [
        toolSpan(61, new Date(t15.getTime() + 15 * 60 * 1000), "search"),
        toolSpan(62, new Date(t15.getTime() + 45 * 60 * 1000), "search"),
      ]),
    )
    // [15:00, 16:00) into 2×30-min buckets aligned to 16:00 (newest-first):
    //   idx 0 = (15:30, 16:00) → the 15:45 call → 1
    //   idx 1 = (15:00, 15:30] → the 15:15 call → 1
    const counts = await runCh(
      reader.seriesPerBucket({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        from: t15,
        to: t16,
        bucketMs: 30 * 60 * 1000,
        target: spanTarget({ kind: "count" }, { ...EXECUTE_TOOL, toolName: [{ op: "eq", value: "search" }] }),
      }),
    )
    expect(counts).toEqual([1, 1])
  })
})
