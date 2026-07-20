import type { ScoreAnalyticsOptions, ScoreAnalyticsRepositoryShape } from "@domain/scores"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { type ChSqlClient, OrganizationId, ProjectId, type ScoreId, SessionId, SignalId, TraceId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { ScoreAnalyticsRepositoryLive } from "./score-analytics-repository.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")

// Each top-level describe block opens its own chdb session via `setupFixture`.
// A shared session across all 37 tests pushed chdb's in-process memory tracker
// past the CI runner ceiling — accumulated parts (one per insert in both
// `scores` and the `scores_hourly_buckets_mv` target) eventually caused even
// `TRUNCATE TABLE` in `beforeEach` to OOM. Scoping the session per describe
// bounds part accumulation to a single block's worth of inserts.
function setupFixture() {
  const ch = setupTestClickHouse()
  let repo: ScoreAnalyticsRepositoryShape | undefined

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* ScoreAnalyticsRepository
      }).pipe(withClickHouse(ScoreAnalyticsRepositoryLive, ch.client, ORG_ID)),
    )
  })

  return {
    get repo() {
      if (!repo) throw new Error("repo not initialized — fixture used before beforeAll ran")
      return repo
    },
    runCh: <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
      Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID)))),
    insertScores: async (rows: ReturnType<typeof makeScoreRow>[]) => {
      await ch.client.insert({ table: "scores", values: rows, format: "JSONEachRow" })
    },
    insertSpans: async (rows: SpanRow[]) => {
      await ch.client.insert({ table: "spans", values: rows, format: "JSONEachRow" })
    },
  }
}

// Helper to create a score analytics row for insertion
function makeScoreRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: overrides.id ?? `score_${String(Math.random()).slice(2, 14).padEnd(12, "0")}`,
    organization_id: (overrides.organization_id as string) ?? (ORG_ID as string),
    project_id: (overrides.project_id as string) ?? (PROJECT_ID as string),
    session_id: (overrides.session_id as string) ?? "",
    trace_id: (overrides.trace_id as string) ?? "",
    span_id: (overrides.span_id as string) ?? "",
    source: (overrides.source as string) ?? "evaluation",
    source_id: (overrides.source_id as string) ?? "eval_src_000000000000",
    simulation_id: (overrides.simulation_id as string) ?? "",
    signal_id: (overrides.signal_id as string) ?? "",
    value: (overrides.value as number) ?? 0.8,
    passed: overrides.passed !== undefined ? overrides.passed : true,
    errored: overrides.errored !== undefined ? overrides.errored : false,
    duration: (overrides.duration as number) ?? 1000000,
    tokens: (overrides.tokens as number) ?? 100,
    cost: (overrides.cost as number) ?? 50,
    created_at: (overrides.created_at as string) ?? "2026-03-15 12:00:00.000",
  }
}

function makeSpanRow(overrides: {
  readonly traceId: string
  readonly spanId: string
  readonly tags: readonly string[]
  readonly startTime?: string
}): SpanRow {
  const startTime = overrides.startTime ?? "2026-03-15 12:00:00.000"
  return {
    organization_id: ORG_ID as string,
    project_id: PROJECT_ID as string,
    session_id: "",
    user_id: "",
    trace_id: overrides.traceId,
    span_id: overrides.spanId,
    parent_span_id: "",
    api_key_id: "test-api-key",
    simulation_id: "",
    start_time: startTime,
    end_time: startTime,
    name: "test-span",
    service_name: "test-service",
    kind: 0,
    status_code: 0,
    status_message: "",
    error_type: "",
    tags: [...overrides.tags],
    metadata: {},
    operation: "chat",
    provider: "",
    model: "",
    agent_name: "",
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
  }
}

const toClickHouseDateTime64 = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "")

const daysAgoDateTime = (days: number, hour: number): string => {
  const value = new Date()
  value.setUTCHours(hour, 0, 0, 0)
  value.setUTCDate(value.getUTCDate() - days)
  return toClickHouseDateTime64(value)
}

const daysAgoBucket = (days: number): string => {
  const value = new Date()
  value.setUTCHours(12, 0, 0, 0)
  value.setUTCDate(value.getUTCDate() - days)
  return value.toISOString().slice(0, 10)
}

describe("ScoreAnalyticsRepository", () => {
  // ------------------------------------------------------------------
  // existsById / insert
  // ------------------------------------------------------------------

  describe("existsById / insert", () => {
    const fixture = setupFixture()

    it("returns false for non-existent score", async () => {
      const exists = await fixture.runCh(fixture.repo.existsById("zzzzzzzzzzzzzzzzzzzzzzzz" as ScoreId))
      expect(exists).toBe(false)
    })

    it("returns true after insert", async () => {
      const id = "aaaaaaaaaaaaaaaaaaaaaaaa"
      await fixture.insertScores([makeScoreRow({ id })])
      const exists = await fixture.runCh(fixture.repo.existsById(id as ScoreId))
      expect(exists).toBe(true)
    })
  })

  // ------------------------------------------------------------------
  // delete (lightweight DELETE — rows masked from SELECTs)
  // ------------------------------------------------------------------

  describe("delete", () => {
    const fixture = setupFixture()

    it("hides the score from existsById and aggregates after lightweight delete", async () => {
      const id = "dddddddddddddddddddddddd"
      await fixture.insertScores([makeScoreRow({ id, value: 0.99, passed: true, cost: 999, tokens: 10, duration: 1 })])

      expect(await fixture.runCh(fixture.repo.existsById(id as ScoreId))).toBe(true)

      const beforeAgg = await fixture.runCh(
        fixture.repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }),
      )
      const countBefore = beforeAgg.totalScores

      await fixture.runCh(fixture.repo.delete(id as ScoreId))

      expect(await fixture.runCh(fixture.repo.existsById(id as ScoreId))).toBe(false)

      const afterAgg = await fixture.runCh(
        fixture.repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }),
      )
      expect(afterAgg.totalScores).toBe(countBefore - 1)
    })
  })

  // ------------------------------------------------------------------
  // aggregateByProject
  // ------------------------------------------------------------------

  describe("aggregateByProject", () => {
    const fixture = setupFixture()

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({ value: 0.9, passed: true, errored: false, cost: 100, tokens: 200, duration: 5000000 }),
        makeScoreRow({ value: 0.3, passed: false, errored: false, cost: 50, tokens: 100, duration: 3000000 }),
        makeScoreRow({ value: 0.0, passed: false, errored: true, cost: 10, tokens: 50, duration: 1000000 }),
      ])
    })

    it("returns correct project-wide aggregates", async () => {
      const agg = await fixture.runCh(
        fixture.repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }),
      )
      expect(agg.totalScores).toBe(3)
      expect(agg.passedCount).toBe(1)
      expect(agg.failedCount).toBe(1)
      expect(agg.erroredCount).toBe(1)
      expect(agg.totalCost).toBe(160)
      expect(agg.totalTokens).toBe(350)
      expect(agg.avgValue).toBeCloseTo(0.4, 1)
    })

    it("returns empty aggregate for non-existent project", async () => {
      const agg = await fixture.runCh(
        fixture.repo.aggregateByProject({
          organizationId: ORG_ID,
          projectId: ProjectId("xxxxxxxxxxxxxxxxxxxxxxxx"),
        }),
      )
      expect(agg.totalScores).toBe(0)
    })
  })

  // ------------------------------------------------------------------
  // aggregateBySource
  // ------------------------------------------------------------------

  describe("aggregateBySource", () => {
    const fixture = setupFixture()
    const evalSourceId = "src_eval_aaaaaaaaaaaa"
    const customSourceId = "my-custom-tag"

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({ source: "evaluation", source_id: evalSourceId, value: 0.9, passed: true }),
        makeScoreRow({ source: "evaluation", source_id: evalSourceId, value: 0.4, passed: false }),
        makeScoreRow({ source: "custom", source_id: customSourceId, value: 0.7, passed: true }),
      ])
    })

    it("scopes aggregate to the requested source", async () => {
      const agg = await fixture.runCh(
        fixture.repo.aggregateBySource({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          source: "evaluation",
          sourceId: evalSourceId,
        }),
      )
      expect(agg.totalScores).toBe(2)
      expect(agg.passedCount).toBe(1)
      expect(agg.failedCount).toBe(1)
    })

    it("returns zero for unmatched source", async () => {
      const agg = await fixture.runCh(
        fixture.repo.aggregateBySource({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          source: "custom",
          sourceId: "nonexistent",
        }),
      )
      expect(agg.totalScores).toBe(0)
    })
  })

  // ------------------------------------------------------------------
  // trendBySource
  // ------------------------------------------------------------------

  describe("trendBySource", () => {
    const fixture = setupFixture()
    const sourceId = "trend_eval_src_aaaaaaa"

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({
          source: "evaluation",
          source_id: sourceId,
          created_at: daysAgoDateTime(2, 10),
          value: 0.5,
          passed: true,
        }),
        makeScoreRow({
          source: "evaluation",
          source_id: sourceId,
          created_at: daysAgoDateTime(2, 18),
          value: 0.7,
          passed: true,
        }),
        makeScoreRow({
          source: "evaluation",
          source_id: sourceId,
          created_at: daysAgoDateTime(1, 8),
          value: 0.3,
          passed: false,
        }),
      ])
    })

    it("returns daily trend buckets", async () => {
      const trend = await fixture.runCh(
        fixture.repo.trendBySource({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          source: "evaluation",
          sourceId,
          days: 30,
        }),
      )
      expect(trend.length).toBeGreaterThanOrEqual(2)
      const twoDaysAgo = trend.find((bucket) => bucket.bucket.startsWith(daysAgoBucket(2)))
      expect(twoDaysAgo).toBeDefined()
      expect(twoDaysAgo?.totalScores).toBe(2)
    })
  })

  // ------------------------------------------------------------------
  // trendByProject
  // ------------------------------------------------------------------

  describe("trendByProject", () => {
    const fixture = setupFixture()

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({ created_at: daysAgoDateTime(2, 10) }),
        makeScoreRow({ created_at: daysAgoDateTime(2, 14) }),
        makeScoreRow({ created_at: daysAgoDateTime(1, 8) }),
      ])
    })

    it("returns daily project-wide trend", async () => {
      const trend = await fixture.runCh(
        fixture.repo.trendByProject({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          days: 30,
        }),
      )
      expect(trend.length).toBeGreaterThanOrEqual(2)
    })
  })

  // ------------------------------------------------------------------
  // rollupByTraceIds
  // ------------------------------------------------------------------

  describe("rollupByTraceIds", () => {
    const fixture = setupFixture()
    const traceA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const traceB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({ trace_id: traceA, passed: true, errored: false, value: 0.9, source: "evaluation" }),
        makeScoreRow({
          trace_id: traceA,
          passed: false,
          errored: false,
          value: 0.2,
          source: "custom",
          signal_id: "iiiiiiiiiiiiiiiiiiiiiiii",
        }),
        makeScoreRow({ trace_id: traceB, passed: false, errored: true, value: 0.0, source: "evaluation" }),
      ])
    })

    it("returns per-trace rollups", async () => {
      const rollups = await fixture.runCh(
        fixture.repo.rollupByTraceIds({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [TraceId(traceA), TraceId(traceB)],
        }),
      )
      expect(rollups).toHaveLength(2)

      const rollupA = rollups.find((r) => (r.traceId as string) === traceA)
      expect(rollupA).toBeDefined()
      expect(rollupA?.totalScores).toBe(2)
      expect(rollupA?.passedCount).toBe(1)
      expect(rollupA?.failedCount).toBe(1)
      expect(rollupA?.hasSignal).toBe(true)
      expect(rollupA?.sources).toContain("evaluation")
      expect(rollupA?.sources).toContain("custom")

      const rollupB = rollups.find((r) => (r.traceId as string) === traceB)
      expect(rollupB).toBeDefined()
      expect(rollupB?.totalScores).toBe(1)
      expect(rollupB?.erroredCount).toBe(1)
      expect(rollupB?.hasSignal).toBe(false)
    })

    it("returns empty for no trace ids", async () => {
      const rollups = await fixture.runCh(
        fixture.repo.rollupByTraceIds({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [],
        }),
      )
      expect(rollups).toHaveLength(0)
    })
  })

  // ------------------------------------------------------------------
  // listSignalsByTraceIds
  // ------------------------------------------------------------------

  describe("listSignalsByTraceIds", () => {
    const fixture = setupFixture()
    const traceA = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"
    const traceB = "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2"
    const traceOther = "c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3"
    const signalA = "issue_a_".padEnd(24, "0")
    const signalB = "issue_b_".padEnd(24, "0")
    const signalOther = "issue_x_".padEnd(24, "0")

    beforeEach(async () => {
      await fixture.insertScores([
        // signalA seen on traceA twice (occurrences = 2) + once on traceB.
        makeScoreRow({ trace_id: traceA, signal_id: signalA, created_at: "2026-03-20 10:00:00.000" }),
        makeScoreRow({ trace_id: traceA, signal_id: signalA, created_at: "2026-03-25 10:00:00.000" }),
        makeScoreRow({ trace_id: traceB, signal_id: signalA, created_at: "2026-03-22 10:00:00.000" }),
        // signalB only on traceB, more recent than signalA's last-seen.
        makeScoreRow({ trace_id: traceB, signal_id: signalB, created_at: "2026-03-28 10:00:00.000" }),
        // No-issue score on traceA and an issue on a trace outside the session.
        makeScoreRow({ trace_id: traceA, signal_id: "" }),
        makeScoreRow({ trace_id: traceOther, signal_id: signalOther }),
      ])
    })

    it("rolls up issues across the given traces, ordered by last seen desc", async () => {
      const rollups = await fixture.runCh(
        fixture.repo.listSignalsByTraceIds({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [TraceId(traceA), TraceId(traceB)],
        }),
      )

      // signalB (last seen 03-28) before signalA (last seen 03-25); the
      // outside-the-session issue is excluded.
      expect(rollups.map((r) => r.signalId as string)).toEqual([signalB, signalA])

      const rollupA = rollups.find((r) => (r.signalId as string) === signalA)
      expect(rollupA?.occurrences).toBe(3)
      expect([...(rollupA?.traceIds ?? [])].sort()).toEqual([traceA, traceB].sort())
      expect(rollupA?.firstSeenAt).toEqual(new Date("2026-03-20T10:00:00.000Z"))
      expect(rollupA?.lastSeenAt).toEqual(new Date("2026-03-25T10:00:00.000Z"))

      const rollupB = rollups.find((r) => (r.signalId as string) === signalB)
      expect(rollupB?.occurrences).toBe(1)
      expect([...(rollupB?.traceIds ?? [])]).toEqual([traceB])
    })

    it("returns empty for no trace ids", async () => {
      const rollups = await fixture.runCh(
        fixture.repo.listSignalsByTraceIds({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [],
        }),
      )
      expect(rollups).toHaveLength(0)
    })
  })

  // ------------------------------------------------------------------
  // rollupBySessionIds
  // ------------------------------------------------------------------

  describe("rollupBySessionIds", () => {
    const fixture = setupFixture()
    const sessionA = "session-aaa"

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({ session_id: sessionA, passed: true, value: 0.8 }),
        makeScoreRow({ session_id: sessionA, passed: false, value: 0.1 }),
      ])
    })

    it("returns per-session rollups", async () => {
      const rollups = await fixture.runCh(
        fixture.repo.rollupBySessionIds({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          sessionIds: [SessionId(sessionA)],
        }),
      )
      expect(rollups).toHaveLength(1)
      expect(rollups[0]?.totalScores).toBe(2)
      expect(rollups[0]?.passedCount).toBe(1)
    })
  })

  // ------------------------------------------------------------------
  // aggregateBySignals
  // ------------------------------------------------------------------

  describe("aggregateBySignals", () => {
    const fixture = setupFixture()
    const signalA = "issue_aaaaaaaaaaaaaaaaaa"
    const signalB = "issue_bbbbbbbbbbbbbbbbbb"

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalA, created_at: "2026-03-25 10:00:00.000" }),
        makeScoreRow({ signal_id: signalA, created_at: "2026-03-20 10:00:00.000" }),
        makeScoreRow({ signal_id: signalA, created_at: "2026-03-10 10:00:00.000" }),
        makeScoreRow({ signal_id: signalB, created_at: "2026-03-25 10:00:00.000" }),
      ])
    })

    it("returns per-issue occurrence aggregates", async () => {
      const aggs = await fixture.runCh(
        fixture.repo.aggregateBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalA), SignalId(signalB)],
        }),
      )
      expect(aggs).toHaveLength(2)

      const aggA = aggs.find((a) => (a.signalId as string) === signalA)
      expect(aggA).toBeDefined()
      expect(aggA?.totalOccurrences).toBe(3)
      // Fixture rows carry no session_id, so distinct affected sessions is 0.
      expect(aggA?.affectedSessions).toBe(0)
      expect(aggA?.firstSeenAt.toISOString()).toBe("2026-03-10T10:00:00.000Z")
      expect(aggA?.lastSeenAt.toISOString()).toBe("2026-03-25T10:00:00.000Z")
    })

    it("counts distinct non-empty session ids as affectedSessions", async () => {
      const signalC = "issue_cccccccccccccccccc"
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalC, session_id: "session_c1", created_at: "2026-03-25 10:00:00.000" }),
        makeScoreRow({ signal_id: signalC, session_id: "session_c1", created_at: "2026-03-24 10:00:00.000" }),
        makeScoreRow({ signal_id: signalC, session_id: "session_c2", created_at: "2026-03-23 10:00:00.000" }),
        makeScoreRow({ signal_id: signalC, session_id: "", created_at: "2026-03-22 10:00:00.000" }),
      ])

      const aggs = await fixture.runCh(
        fixture.repo.aggregateBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalC)],
        }),
      )

      const aggC = aggs.find((a) => (a.signalId as string) === signalC)
      expect(aggC?.totalOccurrences).toBe(4)
      expect(aggC?.affectedSessions).toBe(2)
    })

    it("returns empty for no issue ids", async () => {
      const aggs = await fixture.runCh(
        fixture.repo.aggregateBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [],
        }),
      )
      expect(aggs).toHaveLength(0)
    })
  })

  // ------------------------------------------------------------------
  // aggregateImpactBySignal
  // ------------------------------------------------------------------

  describe("aggregateImpactBySignal", () => {
    const fixture = setupFixture()
    const signalI = "issue_impactiiiiiiiii"
    const signalOther = "issue_impactother0000"
    const traceI1 = "a".repeat(32)
    const traceI2 = "b".repeat(32)
    const traceOther = "c".repeat(32)
    const sessionI1 = "session-impact-1"
    const sessionI2 = "session-impact-2"
    const sessionOther = "session-impact-other"
    const userU1 = "user-impact-1"
    const userU2 = "user-impact-2"
    const userU3 = "user-impact-3"

    beforeEach(async () => {
      // Spans feed `traces` (cost/tokens) and `sessions` (user_id) via MVs.
      await fixture.insertSpans([
        {
          ...makeSpanRow({ traceId: traceI1, spanId: `i1${"a".repeat(14)}`, tags: [] }),
          session_id: sessionI1,
          user_id: userU1,
          tokens_input: 120,
          tokens_output: 80,
          cost_total_microcents: 100,
        },
        {
          ...makeSpanRow({ traceId: traceI2, spanId: `i2${"a".repeat(14)}`, tags: [] }),
          session_id: sessionI2,
          user_id: userU2,
          tokens_input: 60,
          tokens_output: 40,
          cost_total_microcents: 50,
        },
        // Belongs to another issue — must not contribute to signalI's impact.
        {
          ...makeSpanRow({ traceId: traceOther, spanId: `i3${"a".repeat(14)}`, tags: [] }),
          session_id: sessionOther,
          user_id: userU3,
          tokens_input: 999,
          tokens_output: 999,
          cost_total_microcents: 9999,
        },
      ])

      await fixture.insertScores([
        // Two occurrences on the same trace/session → distinct counts must dedupe.
        makeScoreRow({ signal_id: signalI, trace_id: traceI1, session_id: sessionI1 }),
        makeScoreRow({ signal_id: signalI, trace_id: traceI1, session_id: sessionI1 }),
        makeScoreRow({ signal_id: signalI, trace_id: traceI2, session_id: sessionI2 }),
        // Occurrence with no trace/session: counts toward occurrences only.
        makeScoreRow({ signal_id: signalI, trace_id: "", session_id: "" }),
        // Another issue's occurrence — excluded.
        makeScoreRow({ signal_id: signalOther, trace_id: traceOther, session_id: sessionOther }),
      ])
    })

    it("rolls up occurrences, reach, cost and tokens for one issue", async () => {
      const impact = await fixture.runCh(
        fixture.repo.aggregateImpactBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalI),
        }),
      )

      expect(impact.occurrences).toBe(4)
      expect(impact.affectedTraces).toBe(2)
      expect(impact.affectedSessions).toBe(2)
      expect(impact.affectedUsers).toBe(2)
      expect(impact.costMicrocents).toBe(150)
      expect(impact.tokens).toBe(300)
    })

    it("returns zeroes for an issue with no occurrences", async () => {
      const impact = await fixture.runCh(
        fixture.repo.aggregateImpactBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId("issue_impactemptyyyyy"),
        }),
      )

      expect(impact).toEqual({
        signalId: "issue_impactemptyyyyy",
        occurrences: 0,
        affectedTraces: 0,
        affectedSessions: 0,
        affectedUsers: 0,
        costMicrocents: 0,
        tokens: 0,
      })
    })
  })

  // ------------------------------------------------------------------
  // coOccurrenceBySignal
  // ------------------------------------------------------------------

  describe("coOccurrenceBySignal", () => {
    const fixture = setupFixture()
    const signalSource = "issue_cooccurrencesrc"
    const signalHeavy = "issue_cooccurrencehvy" // shares 3 sessions
    const signalLight = "issue_cooccurrencelgt" // shares 1 session
    const signalDisjoint = "issue_cooccurrencedsj" // shares nothing
    const signalStale = "issue_cooccurrenceold" // shares only outside the range

    const inRange = "2026-03-15 12:00:00.000"
    const outOfRange = "2026-01-01 12:00:00.000"
    const timeRange = {
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-03-31T23:59:59.999Z"),
    }

    const session = (n: number) => `session-cooc-${n}`

    beforeEach(async () => {
      await fixture.insertScores([
        // Source issue: sessions 1-4. Session 1 carries TWO source occurrences
        // so distinct session counting is exercised.
        makeScoreRow({ signal_id: signalSource, session_id: session(1), created_at: inRange }),
        makeScoreRow({ signal_id: signalSource, session_id: session(1), created_at: inRange }),
        makeScoreRow({ signal_id: signalSource, session_id: session(2), created_at: inRange }),
        makeScoreRow({ signal_id: signalSource, session_id: session(3), created_at: inRange }),
        makeScoreRow({ signal_id: signalSource, session_id: session(4), created_at: inRange }),
        // Sessionless source occurrence: ignored by session co-occurrence.
        makeScoreRow({ signal_id: signalSource, session_id: "", created_at: inRange }),
        // Heavy co-occurrer: shares sessions 1-3, plus its own sessions 5-6.
        makeScoreRow({ signal_id: signalHeavy, session_id: session(1), created_at: inRange }),
        makeScoreRow({ signal_id: signalHeavy, session_id: session(2), created_at: inRange }),
        makeScoreRow({ signal_id: signalHeavy, session_id: session(3), created_at: inRange }),
        makeScoreRow({ signal_id: signalHeavy, session_id: session(5), created_at: inRange }),
        makeScoreRow({ signal_id: signalHeavy, session_id: session(6), created_at: inRange }),
        // Light co-occurrer: shares session 1 only, plus its own session 7.
        makeScoreRow({ signal_id: signalLight, session_id: session(1), created_at: inRange }),
        makeScoreRow({ signal_id: signalLight, session_id: session(7), created_at: inRange }),
        // Disjoint issue: session 8 only — must not appear as a candidate.
        makeScoreRow({ signal_id: signalDisjoint, session_id: session(8), created_at: inRange }),
        // Stale co-occurrer: shares session 1 but outside the window.
        makeScoreRow({ signal_id: signalStale, session_id: session(1), created_at: outOfRange }),
      ])
    })

    it("counts shared and total sessions per candidate, self-excluded, windowed", async () => {
      const aggregate = await fixture.runCh(
        fixture.repo.coOccurrenceBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalSource),
          timeRange,
        }),
      )

      // Sessions 1-4 (the sessionless occurrence doesn't count).
      expect(aggregate.mySessions).toBe(4)
      // Universe: sessions 1-8 carry at least one in-range issue occurrence.
      expect(aggregate.totalSessions).toBe(8)
      expect(aggregate.candidates).toEqual([
        { signalId: signalHeavy, sharedSessions: 3, theirSessions: 5 },
        { signalId: signalLight, sharedSessions: 1, theirSessions: 2 },
      ])
    })

    it("respects the candidate limit (trimmed by shared sessions)", async () => {
      const aggregate = await fixture.runCh(
        fixture.repo.coOccurrenceBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalSource),
          timeRange,
          limit: 1,
        }),
      )

      expect(aggregate.candidates.map((candidate) => candidate.signalId)).toEqual([signalHeavy])
      // Totals are unaffected by the candidate cap.
      expect(aggregate.mySessions).toBe(4)
      expect(aggregate.totalSessions).toBe(8)
    })

    it("returns empty counts for an issue with no in-range sessions", async () => {
      const aggregate = await fixture.runCh(
        fixture.repo.coOccurrenceBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalStale),
          timeRange,
        }),
      )

      expect(aggregate.mySessions).toBe(0)
      expect(aggregate.candidates).toEqual([])
    })
  })

  // ------------------------------------------------------------------
  // aggregateDimensionBySignal
  // ------------------------------------------------------------------

  describe("aggregateDimensionBySignal", () => {
    const fixture = setupFixture()
    const signalDim = "issue_dimensioniiiiii"
    const signalOther = "issue_dimensionother0"
    const traceD1 = "d".repeat(32) // in issue
    const traceD2 = "e".repeat(32) // in issue
    const traceD3 = "1".repeat(32) // project trace, NOT in any issue (exercises reverse conditioning)
    const traceOther = "f".repeat(32) // in another issue

    const span = (
      overrides: {
        traceId: string
        spanId: string
        model?: string
        provider?: string
        toolName?: string
        finishReasons?: readonly string[]
      },
      tags: readonly string[] = [],
    ): SpanRow => ({
      ...makeSpanRow({ traceId: overrides.traceId, spanId: overrides.spanId, tags }),
      model: overrides.model ?? "",
      provider: overrides.provider ?? "",
      tool_name: overrides.toolName ?? "",
      finish_reasons: [...(overrides.finishReasons ?? [])],
    })

    beforeEach(async () => {
      await fixture.insertSpans([
        span(
          {
            traceId: traceD1,
            spanId: `d1${"a".repeat(14)}`,
            model: "claude-opus",
            provider: "anthropic",
            toolName: "search",
            finishReasons: ["stop"],
          },
          ["billing"],
        ),
        // Second span on the same trace, same model/provider → trace-level dedup.
        span({ traceId: traceD1, spanId: `d2${"a".repeat(14)}`, model: "claude-opus", provider: "anthropic" }),
        span(
          {
            traceId: traceD2,
            spanId: `e1${"a".repeat(14)}`,
            model: "claude-sonnet",
            provider: "anthropic",
            toolName: "lookup",
            finishReasons: ["length"],
          },
          ["billing", "auth"],
        ),
        // A project trace that also uses claude-opus but is NOT in the issue, so
        // claude-opus's conditional rate is 1/2 rather than 1/1.
        span({
          traceId: traceD3,
          spanId: `c1${"a".repeat(14)}`,
          model: "claude-opus",
          provider: "anthropic",
          finishReasons: ["stop"],
        }),
        // Traffic from a different issue's trace.
        span(
          {
            traceId: traceOther,
            spanId: `f1${"a".repeat(14)}`,
            model: "gpt-4o",
            provider: "openai",
            finishReasons: ["stop"],
          },
          ["onboarding"],
        ),
        span({ traceId: traceOther, spanId: `f2${"a".repeat(14)}`, model: "gpt-4o", provider: "openai" }),
      ])

      await fixture.insertScores([
        makeScoreRow({ signal_id: signalDim, trace_id: traceD1 }),
        makeScoreRow({ signal_id: signalDim, trace_id: traceD2 }),
        // traceD3 has no occurrence — it is a pure project (baseline) trace.
        makeScoreRow({ signal_id: signalOther, trace_id: traceOther }),
      ])
    })

    const byValue = <T extends { value: string }>(values: readonly T[]) =>
      new Map(values.map((v) => [v.value, v] as const))

    const aggregate = (dimension: "model" | "provider" | "tool" | "tag" | "finishReason") =>
      fixture.runCh(
        fixture.repo.aggregateDimensionBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalDim),
          dimension,
        }),
      )

    // One test (not several) because `beforeEach` inserts are not truncated
    // between tests in the shared per-describe chdb session, so re-running it
    // would double the trace counts these assertions check.
    it("computes per-value conditional rates and the base rate (reverse conditioning, trace-level)", async () => {
      // Base rate: 2 of 4 project traces (D1, D2 in issue; D3, Other not) are in the issue.
      const models = await aggregate("model")
      expect(models.dimension).toBe("model")
      expect(models.signalAffectedTraces).toBe(2)
      expect(models.baseRate).toBeCloseTo(0.5, 5)
      // Most-associated first: opus and sonnet both have 1 affected trace, opus has more support.
      expect(models.values.map((v) => v.value)).toEqual(["claude-opus", "claude-sonnet", "gpt-4o"])
      const m = byValue(models.values)
      // claude-opus: used by D1 (issue) and D3 (not) → 1/2 of its traces fall into the issue.
      expect(m.get("claude-opus")).toMatchObject({ totalTraces: 2, affectedTraces: 1 })
      expect(m.get("claude-opus")?.conditionalRate).toBeCloseTo(0.5, 5)
      expect(m.get("claude-opus")?.coverage).toBeCloseTo(0.5, 5)
      // claude-sonnet: only D2, which is in the issue → 100% conditional rate.
      expect(m.get("claude-sonnet")?.conditionalRate).toBeCloseTo(1, 5)
      // gpt-4o: only the other issue's trace → present in the baseline, 0 affected.
      expect(m.get("gpt-4o")).toMatchObject({ totalTraces: 1, affectedTraces: 0 })
      expect(m.get("gpt-4o")?.conditionalRate).toBe(0)

      // Provider: anthropic spans 3 traces (D1, D2, D3), 2 in the issue → 2/3.
      const providers = await aggregate("provider")
      const p = byValue(providers.values)
      expect(p.get("anthropic")).toMatchObject({ totalTraces: 3, affectedTraces: 2 })
      expect(p.get("anthropic")?.conditionalRate).toBeCloseTo(2 / 3, 5)
      expect(p.get("anthropic")?.coverage).toBeCloseTo(1, 5)
      expect(p.get("openai")?.affectedTraces).toBe(0)

      // Tools: D1 → search, D2 → lookup; spans without a tool name are excluded.
      const tools = await aggregate("tool")
      const t = byValue(tools.values)
      expect(t.get("search")).toMatchObject({ totalTraces: 1, affectedTraces: 1 })
      expect(t.get("lookup")?.affectedTraces).toBe(1)
      expect(t.has("")).toBe(false)

      // Tags: flattened, deduped to the trace; onboarding only on the other issue's trace.
      const tags = await aggregate("tag")
      const tg = byValue(tags.values)
      expect(tg.get("billing")).toMatchObject({ totalTraces: 2, affectedTraces: 2 })
      expect(tg.get("billing")?.coverage).toBeCloseTo(1, 5)
      expect(tg.get("auth")?.affectedTraces).toBe(1)
      expect(tg.get("onboarding")?.affectedTraces).toBe(0)

      // Finish reasons: "stop" spans D1, D3 and Other (3 traces), only D1 in the issue → 1/3.
      const finishReasons = await aggregate("finishReason")
      const f = byValue(finishReasons.values)
      expect(f.get("stop")).toMatchObject({ totalTraces: 3, affectedTraces: 1 })
      expect(f.get("stop")?.conditionalRate).toBeCloseTo(1 / 3, 5)
      expect(f.get("length")?.affectedTraces).toBe(1)
    })
  })

  // ------------------------------------------------------------------
  // aggregateTagsBySignals
  // ------------------------------------------------------------------

  describe("aggregateTagsBySignals", () => {
    const fixture = setupFixture()
    const signalA = "issue_tagsaaaaaaaaaaaa"
    const signalB = "issue_tagsbbbbbbbbbbbb"
    const traceA1 = `${"a".repeat(31)}1`
    const traceA2 = `${"a".repeat(31)}2`
    const traceB1 = `${"b".repeat(31)}1`
    const otherOrgTrace = `${"c".repeat(31)}1`

    beforeEach(async () => {
      await fixture.insertSpans([
        makeSpanRow({ traceId: traceA1, spanId: `11${"a".repeat(14)}`, tags: ["checkout", "billing"] }),
        // Second span on the same trace with overlapping + new tags exercises trace-level dedup.
        makeSpanRow({ traceId: traceA1, spanId: `12${"a".repeat(14)}`, tags: ["billing", "auth"] }),
        makeSpanRow({ traceId: traceA2, spanId: `21${"a".repeat(14)}`, tags: ["search"] }),
        makeSpanRow({ traceId: traceB1, spanId: `31${"a".repeat(14)}`, tags: ["onboarding"] }),
        // A span in another organization that must not leak through tenancy.
        {
          ...makeSpanRow({ traceId: otherOrgTrace, spanId: `41${"a".repeat(14)}`, tags: ["leaked"] }),
          organization_id: "other_orgggggggggggggggg",
        },
      ])

      await fixture.insertScores([
        makeScoreRow({ signal_id: signalA, trace_id: traceA1 }),
        makeScoreRow({ signal_id: signalA, trace_id: traceA2 }),
        makeScoreRow({ signal_id: signalB, trace_id: traceB1 }),
        // Score linked to the cross-org trace under a foreign org id.
        makeScoreRow({
          organization_id: "other_orgggggggggggggggg",
          signal_id: signalA,
          trace_id: otherOrgTrace,
        }),
      ])
    })

    // The default seed rows use created_at / start_time = "2026-03-15 12:00:00.000",
    // so any time range that includes mid-March 2026 picks them up.
    const seedWindow = {
      from: new Date("2026-03-01T00:00:00.000Z"),
      to: new Date("2026-04-01T00:00:00.000Z"),
    }

    it("returns the union of trace-level tags grouped by issue, scoped to org/project", async () => {
      const result = await fixture.runCh(
        fixture.repo.aggregateTagsBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalA), SignalId(signalB)],
          timeRange: seedWindow,
        }),
      )

      const tagsBySignal = new Map(result.map((entry) => [entry.signalId as string, [...entry.tags].sort()] as const))
      expect(tagsBySignal.get(signalA)).toEqual(["auth", "billing", "checkout", "search"])
      expect(tagsBySignal.get(signalB)).toEqual(["onboarding"])
      expect(tagsBySignal.get(signalA)).not.toContain("leaked")
    })

    it("returns empty for no issue ids", async () => {
      const result = await fixture.runCh(
        fixture.repo.aggregateTagsBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [],
          timeRange: seedWindow,
        }),
      )
      expect(result).toEqual([])
    })

    it("excludes scores and traces outside the configured time range", async () => {
      // Tighten the window to skip the seeded mid-March data entirely.
      const result = await fixture.runCh(
        fixture.repo.aggregateTagsBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalA), SignalId(signalB)],
          timeRange: {
            from: new Date("2026-04-01T00:00:00.000Z"),
            to: new Date("2026-04-30T00:00:00.000Z"),
          },
        }),
      )

      expect(result).toEqual([])
    })
  })

  // ------------------------------------------------------------------
  // trendBySignal
  // ------------------------------------------------------------------

  describe("trendBySignal", () => {
    const fixture = setupFixture()
    const signalId = "trend_issue_aaaaaaaaaaaa"

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalId, created_at: daysAgoDateTime(2, 10) }),
        makeScoreRow({ signal_id: signalId, created_at: daysAgoDateTime(2, 18) }),
        makeScoreRow({ signal_id: signalId, created_at: daysAgoDateTime(1, 8) }),
      ])
    })

    it("returns occurrence buckets at the requested interval", async () => {
      const trend = await fixture.runCh(
        fixture.repo.trendBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalId),
          days: 30,
          bucketSeconds: 24 * 60 * 60,
        }),
      )
      expect(trend.length).toBeGreaterThanOrEqual(2)
      // Bucket keys are now full ISO timestamps; the YYYY-MM-DD prefix still uniquely identifies
      // the day for fixture rows.
      const twoDaysAgo = trend.find((bucket) => bucket.bucket.startsWith(daysAgoBucket(2)))
      expect(twoDaysAgo).toBeDefined()
      expect(twoDaysAgo?.count).toBe(2)
    })
  })

  // ------------------------------------------------------------------
  // issue page analytics helpers
  // ------------------------------------------------------------------

  describe("issue page analytics reads", () => {
    const fixture = setupFixture()
    const signalA = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const signalB = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const traceA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const traceB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    const from = new Date("2026-04-08T00:00:00.000Z")
    const to = new Date("2026-04-10T23:59:59.999Z")

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({
          signal_id: signalA,
          trace_id: traceA,
          session_id: "session_window_a",
          source: "evaluation",
          source_id: "eval_source_a",
          created_at: "2026-04-08 10:00:00.000",
        }),
        makeScoreRow({
          signal_id: signalA,
          trace_id: traceA,
          session_id: "session_window_a",
          source: "evaluation",
          source_id: "eval_source_a",
          created_at: "2026-04-09 10:00:00.000",
        }),
        makeScoreRow({
          signal_id: signalB,
          trace_id: traceB,
          source: "custom",
          source_id: "custom_source_b",
          created_at: "2026-04-10 09:00:00.000",
        }),
        makeScoreRow({
          signal_id: signalB,
          trace_id: traceB,
          source: "custom",
          source_id: "custom_source_b",
          created_at: "2026-04-01 09:00:00.000",
        }),
      ])
    })

    it("lists issue window metrics within the selected range and score filters", async () => {
      const metrics = await fixture.runCh(
        fixture.repo.listSignalWindowMetrics({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          filters: {
            "score.source": [{ op: "eq", value: "evaluation" }],
          },
          timeRange: { from, to },
        }),
      )

      expect(metrics).toEqual([
        {
          signalId: SignalId(signalA),
          occurrences: 2,
          affectedSessions: 1,
          firstSeenAt: new Date("2026-04-08T10:00:00.000Z"),
          lastSeenAt: new Date("2026-04-09T10:00:00.000Z"),
        },
      ])
    })

    it("builds grouped histogram and per-issue trends for the requested issue ids", async () => {
      const histogram = await fixture.runCh(
        fixture.repo.histogramBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalA), SignalId(signalB)],
          timeRange: { from, to },
          bucketSeconds: 24 * 60 * 60,
        }),
      )
      const trend = await fixture.runCh(
        fixture.repo.trendBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalA), SignalId(signalB)],
          timeRange: { from, to },
        }),
      )

      // `histogramBySignals` now emits ISO timestamps for the bucket key regardless of interval,
      // while `trendBySignals` (used by the row-level mini-bar) keeps the legacy `YYYY-MM-DD` shape.
      expect(histogram).toEqual([
        { bucket: "2026-04-08T00:00:00.000Z", count: 1 },
        { bucket: "2026-04-09T00:00:00.000Z", count: 1 },
        { bucket: "2026-04-10T00:00:00.000Z", count: 1 },
      ])
      expect(trend).toEqual([
        {
          signalId: SignalId(signalA),
          buckets: [
            { bucket: "2026-04-08", count: 1 },
            { bucket: "2026-04-09", count: 1 },
          ],
        },
        {
          signalId: SignalId(signalB),
          buckets: [{ bucket: "2026-04-10", count: 1 }],
        },
      ])
    })

    it("counts distinct traces inside the selected issue window", async () => {
      const total = await fixture.runCh(
        fixture.repo.countDistinctTracesByTimeRange({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          timeRange: { from, to },
        }),
      )

      expect(total).toBe(2)
    })

    it("lists distinct traces for one issue newest-first with pagination", async () => {
      const page = await fixture.runCh(
        fixture.repo.listTracesBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalA),
          limit: 1,
          offset: 0,
        }),
      )

      expect(page.items).toEqual([
        {
          traceId: TraceId(traceA),
          lastSeenAt: new Date("2026-04-09T10:00:00.000Z"),
        },
      ])
      expect(page.hasMore).toBe(false)
      expect(page.limit).toBe(1)
      expect(page.offset).toBe(0)
    })

    it("counts distinct traces linked to one issue", async () => {
      const total = await fixture.runCh(
        fixture.repo.countTracesBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalA),
        }),
      )

      expect(total).toBe(1)
    })

    it("lists distinct sessions for one issue newest-first with pagination", async () => {
      const page = await fixture.runCh(
        fixture.repo.listSessionsBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalA),
          limit: 1,
          offset: 0,
        }),
      )

      expect(page.items).toEqual([
        {
          sessionId: SessionId("session_window_a"),
          lastSeenAt: new Date("2026-04-09T10:00:00.000Z"),
        },
      ])
      expect(page.hasMore).toBe(false)
      expect(page.limit).toBe(1)
      expect(page.offset).toBe(0)
    })

    it("counts distinct sessions linked to one issue", async () => {
      const total = await fixture.runCh(
        fixture.repo.countSessionsBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalA),
        }),
      )

      expect(total).toBe(1)
    })

    it("includes annotation scores where passed=false (signal membership is via signal_id)", async () => {
      const signalAnnotation = "cccccccccccccccccccccccc"
      const traceAnnotation = "cccccccccccccccccccccccccccccccc"
      const sessionAnnotation = "session_annotation_c"

      await fixture.insertScores([
        makeScoreRow({
          signal_id: signalAnnotation,
          trace_id: traceAnnotation,
          session_id: sessionAnnotation,
          source: "annotation",
          source_id: "UI",
          passed: false,
          created_at: "2026-04-09 11:00:00.000",
        }),
      ])

      const page = await fixture.runCh(
        fixture.repo.listSessionsBySignal({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalId: SignalId(signalAnnotation),
        }),
      )

      expect(page.items).toEqual([
        {
          sessionId: SessionId(sessionAnnotation),
          lastSeenAt: new Date("2026-04-09T11:00:00.000Z"),
        },
      ])
    })
  })

  // ------------------------------------------------------------------
  // Simulation exclusion
  // ------------------------------------------------------------------

  describe("excludeSimulations", () => {
    const fixture = setupFixture()
    const simId = "sim_aaaaaaaaaaaaaaaaaaaa"

    beforeEach(async () => {
      await fixture.insertScores([
        makeScoreRow({ simulation_id: simId, value: 0.5, passed: true, cost: 100 }),
        makeScoreRow({ simulation_id: "", value: 0.9, passed: true, cost: 200 }),
      ])
    })

    it("includes simulations by default", async () => {
      const agg = await fixture.runCh(
        fixture.repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }),
      )
      expect(agg.totalScores).toBe(2)
      expect(agg.totalCost).toBe(300)
    })

    it("excludes simulations when requested", async () => {
      const options: ScoreAnalyticsOptions = { excludeSimulations: true }
      const agg = await fixture.runCh(
        fixture.repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID, options }),
      )
      expect(agg.totalScores).toBe(1)
      expect(agg.totalCost).toBe(200)
    })

    it("excludes simulations in trend queries", async () => {
      const recentDate = daysAgoDateTime(1, 12)
      await fixture.insertScores([
        makeScoreRow({ simulation_id: simId, value: 0.5, passed: true, created_at: recentDate }),
        makeScoreRow({ simulation_id: "", value: 0.9, passed: true, created_at: recentDate }),
      ])
      const options: ScoreAnalyticsOptions = { excludeSimulations: true }
      const trend = await fixture.runCh(
        fixture.repo.trendByProject({ organizationId: ORG_ID, projectId: PROJECT_ID, days: 30, options }),
      )
      const totalScores = trend.reduce((sum, b) => sum + b.totalScores, 0)
      expect(totalScores).toBe(1)
    })

    it("excludes simulations in trace rollups", async () => {
      const traceId = "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr"
      await fixture.insertScores([
        makeScoreRow({ trace_id: traceId, simulation_id: simId, passed: true }),
        makeScoreRow({ trace_id: traceId, simulation_id: "", passed: false }),
      ])

      const options: ScoreAnalyticsOptions = { excludeSimulations: true }
      const rollups = await fixture.runCh(
        fixture.repo.rollupByTraceIds({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          traceIds: [TraceId(traceId)],
          options,
        }),
      )
      expect(rollups).toHaveLength(1)
      expect(rollups[0]?.totalScores).toBe(1)
      expect(rollups[0]?.passedCount).toBe(0)
      expect(rollups[0]?.failedCount).toBe(1)
    })
  })

  // ------------------------------------------------------------------
  // escalationSignalsBySignals — feeds the seasonal anomaly detector with
  // sliding-recent counts plus pooled (dow, hour ± 1) × prior 4 weeks
  // expected/stddev from the scores_hourly_buckets MV.
  // ------------------------------------------------------------------

  describe("escalationSignalsBySignals", () => {
    const fixture = setupFixture()
    const signalId = "esc_signals_aaaaaaaaaaaa"
    // Pick a fixed `now` so anchor arithmetic doesn't depend on the wall clock.
    // 2026-04-29T12:00:00Z is a Wednesday at noon UTC — anchors for `now - week*7d`
    // hit the same (dow, hour) bin on Wed at 12:00 four weeks running.
    const NOW = new Date("2026-04-29T12:00:00.000Z")

    const fmt = (date: Date): string => toClickHouseDateTime64(date)
    const minus = (millis: number) => new Date(NOW.getTime() - millis)
    const HOUR = 60 * 60 * 1000
    const WEEK = 7 * 24 * HOUR

    it("returns zero-filled signals when the issue has no scores", async () => {
      const signals = await fixture.runCh(
        fixture.repo.escalationSignalsBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalId)],
          now: NOW,
        }),
      )

      expect(signals).toHaveLength(1)
      expect(signals[0]).toMatchObject({
        signalId,
        recent1h: 0,
        recent6h: 0,
        recent24h: 0,
        expected1h: 0,
        expected6hPerHour: 0,
        stddev1h: 0,
        stddev6hPerHour: 0,
        samplesCount: 0,
      })
    })

    it("computes sliding recents (1h / 6h / 24h) over raw scores against the overridable now", async () => {
      // Scatter events into the trailing windows so the boundary semantics show up:
      //   t-30m, t-2h, t-7h, t-20h, t-26h
      // recent_1h = 1 (only t-30m)
      // recent_6h = 2 (t-30m, t-2h)
      // recent_24h = 4 (t-30m, t-2h, t-7h, t-20h) — t-26h is outside
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(30 * 60 * 1000)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(2 * HOUR)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(7 * HOUR)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(20 * HOUR)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(26 * HOUR)) }),
      ])

      const signals = await fixture.runCh(
        fixture.repo.escalationSignalsBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalId)],
          now: NOW,
        }),
      )

      expect(signals[0]).toMatchObject({ recent1h: 1, recent6h: 2, recent24h: 4 })
    })

    it("counts samplesCount as distinct prior weeks contributing to the (dow, hour) pool", async () => {
      // Plant one row at the center anchor for each of weeks 1, 2, 3 (skip week 4)
      // so the pool gathers samples from 3 distinct prior weeks.
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(1 * WEEK)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(2 * WEEK)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(3 * WEEK)) }),
      ])

      const signals = await fixture.runCh(
        fixture.repo.escalationSignalsBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalId)],
          now: NOW,
        }),
      )

      expect(signals[0]?.samplesCount).toBe(3)
    })

    it("pools (dow, hour ± 1) buckets across prior weeks into expected1h / stddev1h", async () => {
      // Plant 1 event per week at the center anchor (week N · 7d before NOW)
      // across all 4 prior weeks. With a constant count of 1, mean = 1 and stddev = 0.
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(1 * WEEK)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(2 * WEEK)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(3 * WEEK)) }),
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(4 * WEEK)) }),
      ])

      const signals = await fixture.runCh(
        fixture.repo.escalationSignalsBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalId)],
          now: NOW,
        }),
      )

      // 12 anchor slots (4 weeks × ±1h pool). Each week contributes one event
      // into its center anchor, leaving the other two ±1h slots at 0. So the
      // sample set is [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0] → mean = 4/12.
      expect(signals[0]?.expected1h).toBeCloseTo(4 / 12, 5)
      expect(signals[0]?.samplesCount).toBe(4)
      expect(signals[0]?.stddev1h).toBeGreaterThan(0)
    })

    it("returns one signals row per requested issue", async () => {
      const otherSignal = "esc_signals_bbbbbbbbbbbb"
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalId, created_at: fmt(minus(30 * 60 * 1000)) }),
        makeScoreRow({ signal_id: otherSignal, created_at: fmt(minus(30 * 60 * 1000)) }),
        makeScoreRow({ signal_id: otherSignal, created_at: fmt(minus(30 * 60 * 1000)) }),
      ])

      const signals = await fixture.runCh(
        fixture.repo.escalationSignalsBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalId), SignalId(otherSignal)],
          now: NOW,
        }),
      )

      expect(signals).toHaveLength(2)
      const byId = Object.fromEntries(signals.map((s) => [s.signalId, s.recent1h]))
      expect(byId[signalId]).toBe(1)
      expect(byId[otherSignal]).toBe(2)
    })
  })

  // ------------------------------------------------------------------
  // escalationThresholdHistogramBySignals — projects the entry band across
  // a histogram's buckets so the trend chart can draw the dashed line.
  // ------------------------------------------------------------------

  describe("escalationThresholdHistogramBySignals", () => {
    const fixture = setupFixture()
    const signalId = "esc_thresh_aaaaaaaaaaaaa"

    it("returns an empty array when no issue ids are passed", async () => {
      const series = await fixture.runCh(
        fixture.repo.escalationThresholdHistogramBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [],
          timeRange: { from: new Date("2026-04-01"), to: new Date("2026-04-08") },
          bucketSeconds: 12 * 60 * 60,
          kShort: 3,
        }),
      )
      expect(series).toEqual([])
    })

    it("returns an empty array when bucketSeconds < 1h (sub-hour buckets unsupported)", async () => {
      const series = await fixture.runCh(
        fixture.repo.escalationThresholdHistogramBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalId)],
          timeRange: { from: new Date("2026-04-01"), to: new Date("2026-04-08") },
          bucketSeconds: 30 * 60,
          kShort: 3,
        }),
      )
      expect(series).toEqual([])
    })

    it("emits NaN thresholds for issues without prior-pool history", async () => {
      const trendFrom = new Date("2026-04-22T00:00:00.000Z")
      const trendTo = new Date("2026-04-29T00:00:00.000Z")

      const series = await fixture.runCh(
        fixture.repo.escalationThresholdHistogramBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalId)],
          timeRange: { from: trendFrom, to: trendTo },
          bucketSeconds: 12 * 60 * 60,
          kShort: 3,
        }),
      )

      expect(series).toHaveLength(1)
      expect(series[0]?.buckets.length).toBeGreaterThan(0)
      for (const bucket of series[0]?.buckets ?? []) {
        expect(Number.isNaN(bucket.thresholdCount)).toBe(true)
      }
    })

    it("emits finite thresholds when prior-window history exists, and bucket keys align with the histogram scaffold", async () => {
      const trendFrom = new Date("2026-04-22T00:00:00.000Z")
      const trendTo = new Date("2026-04-29T00:00:00.000Z")
      // Seed history inside the prior window [trendEnd − 4w, trendEnd) so the
      // pool has data to fold into expected / σ.
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalId, created_at: "2026-04-08 10:00:00.000" }),
        makeScoreRow({ signal_id: signalId, created_at: "2026-04-08 11:00:00.000" }),
        makeScoreRow({ signal_id: signalId, created_at: "2026-04-15 10:00:00.000" }),
      ])

      const series = await fixture.runCh(
        fixture.repo.escalationThresholdHistogramBySignals({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          signalIds: [SignalId(signalId)],
          timeRange: { from: trendFrom, to: trendTo },
          bucketSeconds: 12 * 60 * 60,
          kShort: 3,
        }),
      )

      expect(series).toHaveLength(1)
      const buckets = series[0]?.buckets ?? []
      expect(buckets.length).toBeGreaterThan(0)
      // Every bucket should carry a finite threshold (variance floor keeps the
      // band defined even on hours with no contributing samples).
      for (const bucket of buckets) {
        expect(Number.isFinite(bucket.thresholdCount)).toBe(true)
        expect(bucket.thresholdCount).toBeGreaterThan(0)
      }
      // Bucket keys are 12h-aligned ISO timestamps starting at trendFrom.
      expect(buckets[0]?.bucket).toBe("2026-04-22T00:00:00.000Z")
      expect(buckets[1]?.bucket).toBe("2026-04-22T12:00:00.000Z")
    })

    it("scales the threshold with k_short — higher k widens the band", async () => {
      const trendFrom = new Date("2026-04-22T00:00:00.000Z")
      const trendTo = new Date("2026-04-29T00:00:00.000Z")
      await fixture.insertScores([
        makeScoreRow({ signal_id: signalId, created_at: "2026-04-08 10:00:00.000" }),
        makeScoreRow({ signal_id: signalId, created_at: "2026-04-15 10:00:00.000" }),
      ])

      const [low, high] = await Promise.all([
        fixture.runCh(
          fixture.repo.escalationThresholdHistogramBySignals({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            signalIds: [SignalId(signalId)],
            timeRange: { from: trendFrom, to: trendTo },
            bucketSeconds: 12 * 60 * 60,
            kShort: 3,
          }),
        ),
        fixture.runCh(
          fixture.repo.escalationThresholdHistogramBySignals({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            signalIds: [SignalId(signalId)],
            timeRange: { from: trendFrom, to: trendTo },
            bucketSeconds: 12 * 60 * 60,
            kShort: 6,
          }),
        ),
      ])

      const lowMax = Math.max(...(low[0]?.buckets ?? []).map((b) => b.thresholdCount))
      const highMax = Math.max(...(high[0]?.buckets ?? []).map((b) => b.thresholdCount))
      expect(highMax).toBeGreaterThan(lowMax)
    })
  })
})
