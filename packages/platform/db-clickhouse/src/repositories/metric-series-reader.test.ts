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

/** A `traces` + `count` target — the saved-search/match shape this reader supersedes. */
const countTarget = (filterSet: FilterSet = {}, query: string | null = null): MetricSeriesTarget => ({
  stream: "traces",
  filterSet,
  query,
  metric: { kind: "count" },
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
})
