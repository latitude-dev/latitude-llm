import { SavedSearchMatchReader, type SavedSearchMatchReaderShape } from "@domain/monitors"
import { type ChSqlClient, OrganizationId, ProjectId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { insertJsonEachRow } from "../sql.ts"
import { SavedSearchMatchReaderLive } from "./saved-search-match-reader.ts"

const ORG_ID = OrganizationId("o".repeat(24))
// A project of its own so seeded fixtures from other suites can't leak into the counts.
const PROJECT_ID = ProjectId("savedsearchreader00000000")
const TAG = "ss-match"

const toCh = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")

// trace_id / span_id are fixed-width columns (32 / 16 chars); pad to fit.
const traceId = (n: number) => `tr${n}`.padEnd(32, "0")
const spanId = (n: number) => `sp${n}`.padEnd(16, "0")

// One span per trace, so `start_time` (min over the trace) is exactly the span's.
const span = (n: number, startTime: Date, tags: readonly string[] = [TAG]): SpanRow =>
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
    end_time: toCh(new Date(startTime.getTime() + 1_000)),
    name: "ss-match-span",
    service_name: "ss-match-service",
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

const ch = setupTestClickHouse()
const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

describe("SavedSearchMatchReaderLive", () => {
  let reader: SavedSearchMatchReaderShape

  beforeAll(async () => {
    reader = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* SavedSearchMatchReader
      }).pipe(Effect.provide(SavedSearchMatchReaderLive)),
    )
  })

  beforeEach(async () => {
    await Effect.runPromise(
      insertJsonEachRow(ch.client, "spans", [span(1, t10), span(2, t1030), span(3, t11), span(4, t1030, ["other"])]),
    )
  })

  const target = { query: null, filterSet: {} }

  it("counts only traces whose start_time falls in [from, to)", async () => {
    // [10:00, 11:00) includes t10 + t1030 (and the 'other'-tagged trace at t1030); excludes t11.
    const count = await runCh(
      reader.countMatches({ organizationId: ORG_ID, projectId: PROJECT_ID, target, from: t10, to: t11 }),
    )
    expect(count).toBe(3)
  })

  it("excludes the lower bound's predecessor and the upper bound itself", async () => {
    const count = await runCh(
      reader.countMatches({ organizationId: ORG_ID, projectId: PROJECT_ID, target, from: t1030, to: t11 }),
    )
    expect(count).toBe(2)
  })

  it("returns the earliest matching trace start_time", async () => {
    const first = await runCh(
      reader.firstMatchAt({ organizationId: ORG_ID, projectId: PROJECT_ID, target, from: t10, to: t11 }),
    )
    expect(first).toEqual(t10)
  })

  it("returns null when no trace matches the window", async () => {
    const first = await runCh(
      reader.firstMatchAt({
        organizationId: ORG_ID,
        projectId: PROJECT_ID,
        target,
        from: new Date("2026-06-01T12:00:00.000Z"),
        to: new Date("2026-06-01T13:00:00.000Z"),
      }),
    )
    expect(first).toBeNull()
  })

  it("applies the saved search's structured filters", async () => {
    const tagged = { query: null, filterSet: { tags: [{ op: "in" as const, value: [TAG] }] } }
    const count = await runCh(
      reader.countMatches({ organizationId: ORG_ID, projectId: PROJECT_ID, target: tagged, from: t10, to: t11 }),
    )
    // Drops the 'other'-tagged trace → t10 + t1030 only.
    expect(count).toBe(2)
  })

  it("buckets matches newest-first, zero-filled, aligned to `to`", async () => {
    // [09:30, 11:00) tiled into 3×30-min buckets aligned to 11:00 (newest-first):
    //   idx 0 = (10:30, 11:00) → empty (t11 == `to` is excluded)
    //   idx 1 = (10:00, 10:30] → t1030 (+ the 'other'-tagged trace, no filter applied) → 2
    //   idx 2 = (09:30, 10:00] → t10 → 1
    const counts = await runCh(
      reader.countMatchesPerBucket({
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
    const tagged = { query: null, filterSet: { tags: [{ op: "in" as const, value: [TAG] }] } }
    const counts = await runCh(
      reader.countMatchesPerBucket({
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
