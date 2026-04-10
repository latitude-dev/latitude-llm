import type { ScoreAnalyticsOptions, ScoreAnalyticsRepositoryShape } from "@domain/scores"
import { ScoreAnalyticsRepository } from "@domain/scores"
import { IssueId, OrganizationId, ProjectId, type ScoreId, SessionId, TraceId } from "@domain/shared"
import { setupTestClickHouse } from "@platform/testkit"
import { Effect } from "effect"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { withClickHouse } from "../with-clickhouse.ts"
import { ScoreAnalyticsRepositoryLive } from "./score-analytics-repository.ts"

const ORG_ID = OrganizationId("oooooooooooooooooooooooo")
const PROJECT_ID = ProjectId("pppppppppppppppppppppppp")

const ch = setupTestClickHouse()

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
      const exists = await Effect.runPromise(repo.existsById("zzzzzzzzzzzzzzzzzzzzzzzz" as ScoreId))
      expect(exists).toBe(false)
    })

    it("returns true after insert", async () => {
      const id = "aaaaaaaaaaaaaaaaaaaaaaaa"
      await insertScores([makeScoreRow({ id })])
      const exists = await Effect.runPromise(repo.existsById(id as ScoreId))
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

      expect(await Effect.runPromise(repo.existsById(id as ScoreId))).toBe(true)

      const beforeAgg = await Effect.runPromise(
        repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }),
      )
      const countBefore = beforeAgg.totalScores

      await Effect.runPromise(repo.delete(id as ScoreId))

      expect(await Effect.runPromise(repo.existsById(id as ScoreId))).toBe(false)

      const afterAgg = await Effect.runPromise(
        repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }),
      )
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
      const agg = await Effect.runPromise(repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }))
      expect(agg.totalScores).toBe(3)
      expect(agg.passedCount).toBe(1)
      expect(agg.failedCount).toBe(1)
      expect(agg.erroredCount).toBe(1)
      expect(agg.totalCost).toBe(160)
      expect(agg.totalTokens).toBe(350)
      expect(agg.avgValue).toBeCloseTo(0.4, 1)
    })

    it("returns empty aggregate for non-existent project", async () => {
      const agg = await Effect.runPromise(
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
      const agg = await Effect.runPromise(
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
      const agg = await Effect.runPromise(
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
      const trend = await Effect.runPromise(
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
      const trend = await Effect.runPromise(
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
      const rollups = await Effect.runPromise(
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
      const rollups = await Effect.runPromise(
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
      const rollups = await Effect.runPromise(
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
      const aggs = await Effect.runPromise(
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
      const aggs = await Effect.runPromise(
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

    it("returns daily occurrence buckets", async () => {
      const trend = await Effect.runPromise(
        repo.trendByIssue({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueId: IssueId(issueId),
          days: 30,
        }),
      )
      expect(trend.length).toBeGreaterThanOrEqual(2)
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
      const metrics = await Effect.runPromise(
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
      const histogram = await Effect.runPromise(
        repo.histogramByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueA), IssueId(issueB)],
          timeRange: { from, to },
        }),
      )
      const trend = await Effect.runPromise(
        repo.trendByIssues({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          issueIds: [IssueId(issueA), IssueId(issueB)],
          timeRange: { from, to },
        }),
      )

      expect(histogram).toEqual([
        { bucket: "2026-04-08", count: 1 },
        { bucket: "2026-04-09", count: 1 },
        { bucket: "2026-04-10", count: 1 },
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
      const total = await Effect.runPromise(
        repo.countDistinctTracesByTimeRange({
          organizationId: ORG_ID,
          projectId: PROJECT_ID,
          timeRange: { from, to },
        }),
      )

      expect(total).toBe(2)
    })

    it("lists distinct traces for one issue newest-first with pagination", async () => {
      const page = await Effect.runPromise(
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
      const agg = await Effect.runPromise(repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID }))
      expect(agg.totalScores).toBe(2)
      expect(agg.totalCost).toBe(300)
    })

    it("excludes simulations when requested", async () => {
      const options: ScoreAnalyticsOptions = { excludeSimulations: true }
      const agg = await Effect.runPromise(
        repo.aggregateByProject({ organizationId: ORG_ID, projectId: PROJECT_ID, options }),
      )
      expect(agg.totalScores).toBe(1)
      expect(agg.totalCost).toBe(200)
    })

    it("excludes simulations in trend queries", async () => {
      const options: ScoreAnalyticsOptions = { excludeSimulations: true }
      const trend = await Effect.runPromise(
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
      const rollups = await Effect.runPromise(
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
})
