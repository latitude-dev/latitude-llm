import type { ScoreAnalyticsOptions, ScoreAnalyticsRepositoryShape } from "@domain/scores"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { type ChSqlClient, IssueId, OrganizationId, ProjectId, type ScoreId, SessionId, TraceId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ChSqlClientLive } from "../ch-sql-client.ts"
import type { SpanRow } from "../seeds/spans/span-builders.ts"
import { withClickHouse } from "../with-clickhouse.ts"
import { ScoreAnalyticsRepositoryLive } from "./score-analytics-repository.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")

const ch = setupTestClickHouse()

const runCh = <A, E>(effect: Effect.Effect<A, E, ChSqlClient>) =>
  Effect.runPromise(effect.pipe(Effect.provide(ChSqlClientLive(ch.client, ORG_ID))))

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
    issue_id: (overrides.issue_id as string) ?? "",
    value: (overrides.value as number) ?? 0.8,
    passed: overrides.passed !== undefined ? overrides.passed : true,
    errored: overrides.errored !== undefined ? overrides.errored : false,
    duration: (overrides.duration as number) ?? 1000000,
    tokens: (overrides.tokens as number) ?? 100,
    cost: (overrides.cost as number) ?? 50,
    created_at: (overrides.created_at as string) ?? "2026-03-15 12:00:00.000",
  }
}

async function insertScores(rows: ReturnType<typeof makeScoreRow>[]) {
  await ch.client.insert({ table: "scores", values: rows, format: "JSONEachRow" })
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
  }
}

async function insertSpans(rows: SpanRow[]) {
  await ch.client.insert({ table: "spans", values: rows, format: "JSONEachRow" })
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
  let repo: ScoreAnalyticsRepositoryShape

  beforeAll(async () => {
    repo = await Effect.runPromise(
      Effect.gen(function* () {
        return yield* ScoreAnalyticsRepository
      }).pipe(withClickHouse(ScoreAnalyticsRepositoryLive, ch.client, ORG_ID)),
    )
  })

  // ------------------------------------------------------------------
  // existsById / insert
  // ------------------------------------------------------------------

  describe("existsById / insert", () => {
    it("returns false for non-existent score", async () => {
      const exists = await runCh(repo.existsById("zzzzzzzzzzzzzzzzzzzzzzzz" as ScoreId))
      expect(exists).toBe(false)
    })

    it("returns true after insert", async () => {
      const id = "aaaaaaaaaaaaaaaaaaaaaaaa"
      await insertScores([makeScoreRow({ id })])
      const exists = await runCh(repo.existsById(id as ScoreId))
      expect(exists).toBe(true)
    })
  })

  // ------------------------------------------------------------------
  // delete (lightweight DELETE — rows masked from SELECTs)
  // ------------------------------------------------------------------

  describe("delete", () => {
    it("hides the score from existsById and aggregates after lightweight delete", async () => {
      const id = "dddddddddddddddddddddddd"
      await insertScores([makeScoreRow({ id, value: 0.99, passed: true, cost: 999, tokens: 10, duration: 1 })])

      expect(await runCh(repo.existsById(id as ScoreId))).toBe(true)

      const beforeAgg = await runCh(repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }))
      const countBefore = beforeAgg.totalScores

      await runCh(repo.delete(id as ScoreId))

      expect(await runCh(repo.existsById(id as ScoreId))).toBe(false)

      const afterAgg = await runCh(repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }))
      expect(afterAgg.totalScores).toBe(countBefore - 1)
    })
  })

  // ------------------------------------------------------------------
  // aggregateByProject
  // ------------------------------------------------------------------

  describe("aggregateByProject", () => {
    beforeEach(async () => {
      await insertScores([
        makeScoreRow({ value: 0.9, passed: true, errored: false, cost: 100, tokens: 200, duration: 5000000 }),
        makeScoreRow({ value: 0.3, passed: false, errored: false, cost: 50, tokens: 100, duration: 3000000 }),
        makeScoreRow({ value: 0.0, passed: false, errored: true, cost: 10, tokens: 50, duration: 1000000 }),
      ])
    })

    it("returns correct project-wide aggregates", async () => {
      const agg = await runCh(repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }))
      expect(agg.totalScores).toBe(3)
      expect(agg.passedCount).toBe(1)
      expect(agg.failedCount).toBe(1)
      expect(agg.erroredCount).toBe(1)
      expect(agg.totalCost).toBe(160)
      expect(agg.totalTokens).toBe(350)
      expect(agg.avgValue).toBeCloseTo(0.4, 1)
    })

    it("returns empty aggregate for non-existent project", async () => {
      const agg = await runCh(
        repo.aggregateByProject({
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
    const evalSourceId = "src_eval_aaaaaaaaaaaa"
    const customSourceId = "my-custom-tag"

    beforeEach(async () => {
      await insertScores([
        makeScoreRow({ source: "evaluation", source_id: evalSourceId, value: 0.9, passed: true }),
        makeScoreRow({ source: "evaluation", source_id: evalSourceId, value: 0.4, passed: false }),
        makeScoreRow({ source: "custom", source_id: customSourceId, value: 0.7, passed: true }),
      ])
    })

    it("scopes aggregate to the requested source", async () => {
      const agg = await runCh(
        repo.aggregateBySource({
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
      const agg = await runCh(
        repo.aggregateBySource({
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
    const sourceId = "trend_eval_src_aaaaaaa"

    beforeEach(async () => {
      await insertScores([
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
      const trend = await runCh(
        repo.trendBySource({
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
    beforeEach(async () => {
      await insertScores([
        makeScoreRow({ created_at: daysAgoDateTime(2, 10) }),
        makeScoreRow({ created_at: daysAgoDateTime(2, 14) }),
        makeScoreRow({ created_at: daysAgoDateTime(1, 8) }),
      ])
    })

    it("returns daily project-wide trend", async () => {
      const trend = await runCh(
        repo.trendByProject({
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
    const traceA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const traceB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

    beforeEach(async () => {
      await insertScores([
        makeScoreRow({ trace_id: traceA, passed: true, errored: false, value: 0.9, source: "evaluation" }),
        makeScoreRow({
          trace_id: traceA,
          passed: false,
          errored: false,
          value: 0.2,
          source: "custom",
          issue_id: "iiiiiiiiiiiiiiiiiiiiiiii",
        }),
        makeScoreRow({ trace_id: traceB, passed: false, errored: true, value: 0.0, source: "evaluation" }),
      ])
    })

    it("returns per-trace rollups", async () => {
      const rollups = await runCh(
        repo.rollupByTraceIds({
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
      expect(rollupA?.hasIssue).toBe(true)
      expect(rollupA?.sources).toContain("evaluation")
      expect(rollupA?.sources).toContain("custom")

      const rollupB = rollups.find((r) => (r.traceId as string) === traceB)
      expect(rollupB).toBeDefined()
      expect(rollupB?.totalScores).toBe(1)
      expect(rollupB?.erroredCount).toBe(1)
      expect(rollupB?.hasIssue).toBe(false)
    })

    it("returns empty for no trace ids", async () => {
      const rollups = await runCh(
        repo.rollupByTraceIds({
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
    const sessionA = "session-aaa"

    beforeEach(async () => {
      await insertScores([
        makeScoreRow({ session_id: sessionA, passed: true, value: 0.8 }),
        makeScoreRow({ session_id: sessionA, passed: false, value: 0.1 }),
      ])
    })

    it("returns per-session rollups", async () => {
      const rollups = await runCh(
        repo.rollupBySessionIds({
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
  // aggregateByIssues
  // ------------------------------------------------------------------

  describe("aggregateByIssues", () => {
    const issueA = "issue_aaaaaaaaaaaaaaaaaa"
    const issueB = "issue_bbbbbbbbbbbbbbbbbb"

    beforeEach(async () => {
      await insertScores([
        makeScoreRow({ issue_id: issueA, created_at: "2026-03-25 10:00:00.000" }),
        makeScoreRow({ issue_id: issueA, created_at: "2026-03-20 10:00:00.000" }),
        makeScoreRow({ issue_id: issueA, created_at: "2026-03-10 10:00:00.000" }),
        makeScoreRow({ issue_id: issueB, created_at: "2026-03-25 10:00:00.000" }),
      ])
    })

    it("returns per-issue occurrence aggregates", async () => {
      const aggs = await runCh(
        repo.aggregateByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueA), IssueId(issueB)],
        }),
      )
      expect(aggs).toHaveLength(2)

      const aggA = aggs.find((a) => (a.issueId as string) === issueA)
      expect(aggA).toBeDefined()
      expect(aggA?.totalOccurrences).toBe(3)
      expect(aggA?.firstSeenAt.toISOString()).toBe("2026-03-10T10:00:00.000Z")
      expect(aggA?.lastSeenAt.toISOString()).toBe("2026-03-25T10:00:00.000Z")
    })

    it("returns empty for no issue ids", async () => {
      const aggs = await runCh(
        repo.aggregateByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [],
        }),
      )
      expect(aggs).toHaveLength(0)
    })
  })

  // ------------------------------------------------------------------
  // aggregateTagsByIssues
  // ------------------------------------------------------------------

  describe("aggregateTagsByIssues", () => {
    const issueA = "issue_tagsaaaaaaaaaaaa"
    const issueB = "issue_tagsbbbbbbbbbbbb"
    const traceA1 = `${"a".repeat(31)}1`
    const traceA2 = `${"a".repeat(31)}2`
    const traceB1 = `${"b".repeat(31)}1`
    const otherOrgTrace = `${"c".repeat(31)}1`

    beforeEach(async () => {
      await insertSpans([
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

      await insertScores([
        makeScoreRow({ issue_id: issueA, trace_id: traceA1 }),
        makeScoreRow({ issue_id: issueA, trace_id: traceA2 }),
        makeScoreRow({ issue_id: issueB, trace_id: traceB1 }),
        // Score linked to the cross-org trace under a foreign org id.
        makeScoreRow({
          organization_id: "other_orgggggggggggggggg",
          issue_id: issueA,
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
      const result = await runCh(
        repo.aggregateTagsByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueA), IssueId(issueB)],
          timeRange: seedWindow,
        }),
      )

      const tagsByIssue = new Map(result.map((entry) => [entry.issueId as string, [...entry.tags].sort()] as const))
      expect(tagsByIssue.get(issueA)).toEqual(["auth", "billing", "checkout", "search"])
      expect(tagsByIssue.get(issueB)).toEqual(["onboarding"])
      expect(tagsByIssue.get(issueA)).not.toContain("leaked")
    })

    it("returns empty for no issue ids", async () => {
      const result = await runCh(
        repo.aggregateTagsByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [],
          timeRange: seedWindow,
        }),
      )
      expect(result).toEqual([])
    })

    it("excludes scores and traces outside the configured time range", async () => {
      // Tighten the window to skip the seeded mid-March data entirely.
      const result = await runCh(
        repo.aggregateTagsByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueA), IssueId(issueB)],
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
  // trendByIssue
  // ------------------------------------------------------------------

  describe("trendByIssue", () => {
    const issueId = "trend_issue_aaaaaaaaaaaa"

    beforeEach(async () => {
      await insertScores([
        makeScoreRow({ issue_id: issueId, created_at: daysAgoDateTime(2, 10) }),
        makeScoreRow({ issue_id: issueId, created_at: daysAgoDateTime(2, 18) }),
        makeScoreRow({ issue_id: issueId, created_at: daysAgoDateTime(1, 8) }),
      ])
    })

    it("returns occurrence buckets at the requested interval", async () => {
      const trend = await runCh(
        repo.trendByIssue({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueId: IssueId(issueId),
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
    const issueA = "aaaaaaaaaaaaaaaaaaaaaaaa"
    const issueB = "bbbbbbbbbbbbbbbbbbbbbbbb"
    const traceA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    const traceB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
    const from = new Date("2026-04-08T00:00:00.000Z")
    const to = new Date("2026-04-10T23:59:59.999Z")

    beforeEach(async () => {
      await insertScores([
        makeScoreRow({
          issue_id: issueA,
          trace_id: traceA,
          source: "evaluation",
          source_id: "eval_source_a",
          created_at: "2026-04-08 10:00:00.000",
        }),
        makeScoreRow({
          issue_id: issueA,
          trace_id: traceA,
          source: "evaluation",
          source_id: "eval_source_a",
          created_at: "2026-04-09 10:00:00.000",
        }),
        makeScoreRow({
          issue_id: issueB,
          trace_id: traceB,
          source: "custom",
          source_id: "custom_source_b",
          created_at: "2026-04-10 09:00:00.000",
        }),
        makeScoreRow({
          issue_id: issueB,
          trace_id: traceB,
          source: "custom",
          source_id: "custom_source_b",
          created_at: "2026-04-01 09:00:00.000",
        }),
      ])
    })

    it("lists issue window metrics within the selected range and score filters", async () => {
      const metrics = await runCh(
        repo.listIssueWindowMetrics({
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
          issueId: IssueId(issueA),
          occurrences: 2,
          firstSeenAt: new Date("2026-04-08T10:00:00.000Z"),
          lastSeenAt: new Date("2026-04-09T10:00:00.000Z"),
        },
      ])
    })

    it("builds grouped histogram and per-issue trends for the requested issue ids", async () => {
      const histogram = await runCh(
        repo.histogramByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueA), IssueId(issueB)],
          timeRange: { from, to },
          bucketSeconds: 24 * 60 * 60,
        }),
      )
      const trend = await runCh(
        repo.trendByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueA), IssueId(issueB)],
          timeRange: { from, to },
        }),
      )

      // `histogramByIssues` now emits ISO timestamps for the bucket key regardless of interval,
      // while `trendByIssues` (used by the row-level mini-bar) keeps the legacy `YYYY-MM-DD` shape.
      expect(histogram).toEqual([
        { bucket: "2026-04-08T00:00:00.000Z", count: 1 },
        { bucket: "2026-04-09T00:00:00.000Z", count: 1 },
        { bucket: "2026-04-10T00:00:00.000Z", count: 1 },
      ])
      expect(trend).toEqual([
        {
          issueId: IssueId(issueA),
          buckets: [
            { bucket: "2026-04-08", count: 1 },
            { bucket: "2026-04-09", count: 1 },
          ],
        },
        {
          issueId: IssueId(issueB),
          buckets: [{ bucket: "2026-04-10", count: 1 }],
        },
      ])
    })

    it("counts distinct traces inside the selected issue window", async () => {
      const total = await runCh(
        repo.countDistinctTracesByTimeRange({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          timeRange: { from, to },
        }),
      )

      expect(total).toBe(2)
    })

    it("lists distinct traces for one issue newest-first with pagination", async () => {
      const page = await runCh(
        repo.listTracesByIssue({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueId: IssueId(issueA),
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
      const total = await runCh(
        repo.countTracesByIssue({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueId: IssueId(issueA),
        }),
      )

      expect(total).toBe(1)
    })
  })

  // ------------------------------------------------------------------
  // Simulation exclusion
  // ------------------------------------------------------------------

  describe("excludeSimulations", () => {
    const simId = "sim_aaaaaaaaaaaaaaaaaaaa"

    beforeEach(async () => {
      await insertScores([
        makeScoreRow({ simulation_id: simId, value: 0.5, passed: true, cost: 100 }),
        makeScoreRow({ simulation_id: "", value: 0.9, passed: true, cost: 200 }),
      ])
    })

    it("includes simulations by default", async () => {
      const agg = await runCh(repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }))
      expect(agg.totalScores).toBe(2)
      expect(agg.totalCost).toBe(300)
    })

    it("excludes simulations when requested", async () => {
      const options: ScoreAnalyticsOptions = { excludeSimulations: true }
      const agg = await runCh(repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID, options }))
      expect(agg.totalScores).toBe(1)
      expect(agg.totalCost).toBe(200)
    })

    it("excludes simulations in trend queries", async () => {
      const recentDate = daysAgoDateTime(1, 12)
      await insertScores([
        makeScoreRow({ simulation_id: simId, value: 0.5, passed: true, created_at: recentDate }),
        makeScoreRow({ simulation_id: "", value: 0.9, passed: true, created_at: recentDate }),
      ])
      const options: ScoreAnalyticsOptions = { excludeSimulations: true }
      const trend = await runCh(
        repo.trendByProject({ organizationId: ORG_ID, projectId: PROJECT_ID, days: 30, options }),
      )
      const totalScores = trend.reduce((sum, b) => sum + b.totalScores, 0)
      expect(totalScores).toBe(1)
    })

    it("excludes simulations in trace rollups", async () => {
      const traceId = "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr"
      await insertScores([
        makeScoreRow({ trace_id: traceId, simulation_id: simId, passed: true }),
        makeScoreRow({ trace_id: traceId, simulation_id: "", passed: false }),
      ])

      const options: ScoreAnalyticsOptions = { excludeSimulations: true }
      const rollups = await runCh(
        repo.rollupByTraceIds({
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
  // escalationSignalsByIssues — feeds the seasonal anomaly detector with
  // sliding-recent counts plus pooled (dow, hour ± 1) × prior 4 weeks
  // expected/stddev from the scores_hourly_buckets MV.
  // ------------------------------------------------------------------

  describe("escalationSignalsByIssues", () => {
    const issueId = "esc_signals_aaaaaaaaaaaa"
    // Pick a fixed `now` so anchor arithmetic doesn't depend on the wall clock.
    // 2026-04-29T12:00:00Z is a Wednesday at noon UTC — anchors for `now - week*7d`
    // hit the same (dow, hour) bin on Wed at 12:00 four weeks running.
    const NOW = new Date("2026-04-29T12:00:00.000Z")

    const fmt = (date: Date): string => toClickHouseDateTime64(date)
    const minus = (millis: number) => new Date(NOW.getTime() - millis)
    const HOUR = 60 * 60 * 1000
    const WEEK = 7 * 24 * HOUR

    it("returns zero-filled signals when the issue has no scores", async () => {
      const signals = await runCh(
        repo.escalationSignalsByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueId)],
          now: NOW,
        }),
      )

      expect(signals).toHaveLength(1)
      expect(signals[0]).toMatchObject({
        issueId,
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
      await insertScores([
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(30 * 60 * 1000)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(2 * HOUR)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(7 * HOUR)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(20 * HOUR)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(26 * HOUR)) }),
      ])

      const signals = await runCh(
        repo.escalationSignalsByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueId)],
          now: NOW,
        }),
      )

      expect(signals[0]).toMatchObject({ recent1h: 1, recent6h: 2, recent24h: 4 })
    })

    it("counts samplesCount as distinct prior weeks contributing to the (dow, hour) pool", async () => {
      // Plant one row at the center anchor for each of weeks 1, 2, 3 (skip week 4)
      // so the pool gathers samples from 3 distinct prior weeks.
      await insertScores([
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(1 * WEEK)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(2 * WEEK)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(3 * WEEK)) }),
      ])

      const signals = await runCh(
        repo.escalationSignalsByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueId)],
          now: NOW,
        }),
      )

      expect(signals[0]?.samplesCount).toBe(3)
    })

    it("pools (dow, hour ± 1) buckets across prior weeks into expected1h / stddev1h", async () => {
      // Plant 1 event per week at the center anchor (week N · 7d before NOW)
      // across all 4 prior weeks. With a constant count of 1, mean = 1 and stddev = 0.
      await insertScores([
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(1 * WEEK)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(2 * WEEK)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(3 * WEEK)) }),
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(4 * WEEK)) }),
      ])

      const signals = await runCh(
        repo.escalationSignalsByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueId)],
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
      const otherIssue = "esc_signals_bbbbbbbbbbbb"
      await insertScores([
        makeScoreRow({ issue_id: issueId, created_at: fmt(minus(30 * 60 * 1000)) }),
        makeScoreRow({ issue_id: otherIssue, created_at: fmt(minus(30 * 60 * 1000)) }),
        makeScoreRow({ issue_id: otherIssue, created_at: fmt(minus(30 * 60 * 1000)) }),
      ])

      const signals = await runCh(
        repo.escalationSignalsByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueId), IssueId(otherIssue)],
          now: NOW,
        }),
      )

      expect(signals).toHaveLength(2)
      const byId = Object.fromEntries(signals.map((s) => [s.issueId, s.recent1h]))
      expect(byId[issueId]).toBe(1)
      expect(byId[otherIssue]).toBe(2)
    })
  })

  // ------------------------------------------------------------------
  // escalationThresholdHistogramByIssues — projects the entry band across
  // a histogram's buckets so the trend chart can draw the dashed line.
  // ------------------------------------------------------------------

  describe("escalationThresholdHistogramByIssues", () => {
    const issueId = "esc_thresh_aaaaaaaaaaaaa"

    it("returns an empty array when no issue ids are passed", async () => {
      const series = await runCh(
        repo.escalationThresholdHistogramByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [],
          timeRange: { from: new Date("2026-04-01"), to: new Date("2026-04-08") },
          bucketSeconds: 12 * 60 * 60,
          kShort: 3,
        }),
      )
      expect(series).toEqual([])
    })

    it("returns an empty array when bucketSeconds < 1h (sub-hour buckets unsupported)", async () => {
      const series = await runCh(
        repo.escalationThresholdHistogramByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueId)],
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

      const series = await runCh(
        repo.escalationThresholdHistogramByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueId)],
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
      await insertScores([
        makeScoreRow({ issue_id: issueId, created_at: "2026-04-08 10:00:00.000" }),
        makeScoreRow({ issue_id: issueId, created_at: "2026-04-08 11:00:00.000" }),
        makeScoreRow({ issue_id: issueId, created_at: "2026-04-15 10:00:00.000" }),
      ])

      const series = await runCh(
        repo.escalationThresholdHistogramByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueId)],
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
      await insertScores([
        makeScoreRow({ issue_id: issueId, created_at: "2026-04-08 10:00:00.000" }),
        makeScoreRow({ issue_id: issueId, created_at: "2026-04-15 10:00:00.000" }),
      ])

      const [low, high] = await Promise.all([
        runCh(
          repo.escalationThresholdHistogramByIssues({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            issueIds: [IssueId(issueId)],
            timeRange: { from: trendFrom, to: trendTo },
            bucketSeconds: 12 * 60 * 60,
            kShort: 3,
          }),
        ),
        runCh(
          repo.escalationThresholdHistogramByIssues({
            organizationId: ORG_ID,
            projectId: PROJECT_ID,
            issueIds: [IssueId(issueId)],
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
