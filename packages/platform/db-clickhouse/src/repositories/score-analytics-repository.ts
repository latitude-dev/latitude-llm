import type { ClickHouseClient } from "@clickhouse/client"
import type {
  IssueOccurrenceAggregate,
  IssueOccurrenceBucket,
  Score,
  ScoreAggregate,
  ScoreAnalyticsOptions,
  ScoreTrendBucket,
  SessionScoreRollup,
  TraceScoreRollup,
} from "@domain/scores"
import { ScoreAnalyticsRepository } from "@domain/scores"
import {
  ChSqlClient,
  type ChSqlClientShape,
  type OrganizationId,
  type ProjectId,
  type ScoreId,
  IssueId as toIssueId,
  SessionId as toSessionId,
  TraceId as toTraceId,
} from "@domain/shared"
import { Effect, Layer } from "effect"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const toClickHouseDateTime64 = (value: Date) => value.toISOString().replace("T", " ").replace("Z", "")

const toAnalyticsRow = (score: Score) => ({
  id: score.id,
  organization_id: score.organizationId,
  project_id: score.projectId,
  session_id: score.sessionId ?? "",
  trace_id: score.traceId ?? "",
  span_id: score.spanId ?? "",
  source: score.source,
  source_id: score.sourceId,
  simulation_id: score.simulationId ?? "",
  issue_id: score.issueId ?? "",
  value: score.value,
  passed: score.passed,
  errored: score.errored,
  duration: score.duration,
  tokens: score.tokens,
  cost: score.cost,
  created_at: toClickHouseDateTime64(score.createdAt),
})

/** Returns a SQL fragment that excludes simulation-generated scores when requested. */
const simulationClause = (options?: ScoreAnalyticsOptions): string =>
  options?.excludeSimulations ? " AND simulation_id = ''" : ""

/** Standard scope WHERE clause fragment. */
const scopeClause = (options?: ScoreAnalyticsOptions): string =>
  `organization_id = {organizationId:String} AND project_id = {projectId:String}${simulationClause(options)}`

const scopeParams = (organizationId: OrganizationId, projectId: ProjectId) => ({
  organizationId: organizationId as string,
  projectId: projectId as string,
})

// ---------------------------------------------------------------------------
// Row types for ClickHouse JSON responses
// ---------------------------------------------------------------------------

type AggregateRow = {
  total_scores: string
  avg_value: string
  avg_duration: string
  total_cost: string
  total_tokens: string
  passed_count: string
  failed_count: string
  errored_count: string
}

type TrendRow = {
  bucket: string
  total_scores: string
  avg_value: string
  passed_count: string
  failed_count: string
  errored_count: string
  total_cost: string
  total_tokens: string
}

type TraceRollupRow = {
  trace_id: string
  total_scores: string
  passed_count: string
  failed_count: string
  errored_count: string
  avg_value: string
  has_issue: number
  sources: string[]
}

type SessionRollupRow = {
  session_id: string
  total_scores: string
  passed_count: string
  failed_count: string
  errored_count: string
  avg_value: string
  has_issue: number
  sources: string[]
}

type IssueOccurrenceRow = {
  issue_id: string
  total_occurrences: string
  recent_occurrences: string
  baseline_avg_occurrences: string
  first_seen_at: string
  last_seen_at: string
}

type IssueOccurrenceBucketRow = {
  bucket: string
  count: string
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

const EMPTY_AGGREGATE: ScoreAggregate = {
  totalScores: 0,
  avgValue: 0,
  avgDuration: 0,
  totalCost: 0,
  totalTokens: 0,
  passedCount: 0,
  failedCount: 0,
  erroredCount: 0,
}

const toAggregate = (row: AggregateRow | undefined): ScoreAggregate => {
  if (!row || Number(row.total_scores) === 0) return EMPTY_AGGREGATE
  return {
    totalScores: Number(row.total_scores),
    avgValue: Number(row.avg_value),
    avgDuration: Number(row.avg_duration),
    totalCost: Number(row.total_cost),
    totalTokens: Number(row.total_tokens),
    passedCount: Number(row.passed_count),
    failedCount: Number(row.failed_count),
    erroredCount: Number(row.errored_count),
  }
}

const toTrendBucket = (row: TrendRow): ScoreTrendBucket => ({
  bucket: row.bucket,
  totalScores: Number(row.total_scores),
  avgValue: Number(row.avg_value),
  passedCount: Number(row.passed_count),
  failedCount: Number(row.failed_count),
  erroredCount: Number(row.errored_count),
  totalCost: Number(row.total_cost),
  totalTokens: Number(row.total_tokens),
})

/** Strip null bytes from FixedString values returned by ClickHouse. */
const stripNulls = (s: string): string => s.replace(/\0/g, "")

const toTraceRollup = (row: TraceRollupRow): TraceScoreRollup => ({
  traceId: toTraceId(stripNulls(row.trace_id)),
  totalScores: Number(row.total_scores),
  passedCount: Number(row.passed_count),
  failedCount: Number(row.failed_count),
  erroredCount: Number(row.errored_count),
  avgValue: Number(row.avg_value),
  hasIssue: row.has_issue === 1,
  sources: row.sources.map(stripNulls),
})

const toSessionRollup = (row: SessionRollupRow): SessionScoreRollup => ({
  sessionId: toSessionId(stripNulls(row.session_id)),
  totalScores: Number(row.total_scores),
  passedCount: Number(row.passed_count),
  failedCount: Number(row.failed_count),
  erroredCount: Number(row.errored_count),
  avgValue: Number(row.avg_value),
  hasIssue: row.has_issue === 1,
  sources: row.sources.map(stripNulls),
})

const toIssueOccurrence = (row: IssueOccurrenceRow): IssueOccurrenceAggregate => ({
  issueId: toIssueId(row.issue_id),
  totalOccurrences: Number(row.total_occurrences),
  recentOccurrences: Number(row.recent_occurrences),
  baselineAvgOccurrences: Number(row.baseline_avg_occurrences),
  firstSeenAt: row.first_seen_at,
  lastSeenAt: row.last_seen_at,
})

const toIssueOccurrenceBucket = (row: IssueOccurrenceBucketRow): IssueOccurrenceBucket => ({
  bucket: row.bucket,
  count: Number(row.count),
})

// ---------------------------------------------------------------------------
// Aggregate SELECT fragment (reused across project/source queries)
// ---------------------------------------------------------------------------

const AGGREGATE_SELECT = `
  count()                                              AS total_scores,
  avg(value)                                           AS avg_value,
  avg(duration)                                        AS avg_duration,
  sum(cost)                                            AS total_cost,
  sum(tokens)                                          AS total_tokens,
  countIf(passed = true AND errored = false)           AS passed_count,
  countIf(passed = false AND errored = false)          AS failed_count,
  countIf(errored = true)                              AS errored_count
`

const TREND_SELECT = `
  toDate(created_at) AS bucket,
  count()                                              AS total_scores,
  avg(value)                                           AS avg_value,
  countIf(passed = true AND errored = false)           AS passed_count,
  countIf(passed = false AND errored = false)          AS failed_count,
  countIf(errored = true)                              AS errored_count,
  sum(cost)                                            AS total_cost,
  sum(tokens)                                          AS total_tokens
`

// ---------------------------------------------------------------------------
// Repository implementation
// ---------------------------------------------------------------------------

export const ScoreAnalyticsRepositoryLive = Layer.effect(
  ScoreAnalyticsRepository,
  Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    return {
      // -- existsById --------------------------------------------------------
      existsById: (id: ScoreId) =>
        chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: "SELECT id FROM scores WHERE id = {id:FixedString(24)} LIMIT 1",
              query_params: { id },
              format: "JSONEachRow",
            })
            return result.json<{ id: string }>()
          })
          .pipe(Effect.map((rows) => rows.length > 0)),

      // -- insert ------------------------------------------------------------
      insert: (score: Score) =>
        chSqlClient.query(async (client) => {
          await client.insert({
            table: "scores",
            values: [toAnalyticsRow(score)],
            format: "JSONEachRow",
          })
        }),

      // -- aggregateByProject ------------------------------------------------
      aggregateByProject: ({ organizationId, projectId, options }) =>
        chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${AGGREGATE_SELECT}
                      FROM scores
                      WHERE ${scopeClause(options)}`,
              query_params: scopeParams(organizationId, projectId),
              format: "JSONEachRow",
            })
            return result.json<AggregateRow>()
          })
          .pipe(Effect.map((rows) => toAggregate(rows[0]))),

      // -- aggregateBySource -------------------------------------------------
      aggregateBySource: ({ organizationId, projectId, source, sourceId, options }) =>
        chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${AGGREGATE_SELECT}
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND source = {source:FixedString(32)}
                        AND source_id = {sourceId:FixedString(128)}`,
              query_params: {
                ...scopeParams(organizationId, projectId),
                source: source as string,
                sourceId,
              },
              format: "JSONEachRow",
            })
            return result.json<AggregateRow>()
          })
          .pipe(Effect.map((rows) => toAggregate(rows[0]))),

      // -- trendBySource -----------------------------------------------------
      trendBySource: ({ organizationId, projectId, source, sourceId, days, options }) => {
        const lookback = days ?? 14
        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${TREND_SELECT}
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND source = {source:FixedString(32)}
                        AND source_id = {sourceId:FixedString(128)}
                        AND created_at >= now() - INTERVAL {days:UInt32} DAY
                      GROUP BY bucket
                      ORDER BY bucket ASC`,
              query_params: {
                ...scopeParams(organizationId, projectId),
                source: source as string,
                sourceId,
                days: lookback,
              },
              format: "JSONEachRow",
            })
            return result.json<TrendRow>()
          })
          .pipe(Effect.map((rows) => rows.map(toTrendBucket)))
      },

      // -- trendByProject ----------------------------------------------------
      trendByProject: ({ organizationId, projectId, days, options }) => {
        const lookback = days ?? 14
        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${TREND_SELECT}
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND created_at >= now() - INTERVAL {days:UInt32} DAY
                      GROUP BY bucket
                      ORDER BY bucket ASC`,
              query_params: {
                ...scopeParams(organizationId, projectId),
                days: lookback,
              },
              format: "JSONEachRow",
            })
            return result.json<TrendRow>()
          })
          .pipe(Effect.map((rows) => rows.map(toTrendBucket)))
      },

      // -- rollupByTraceIds --------------------------------------------------
      rollupByTraceIds: ({ organizationId, projectId, traceIds, options }) => {
        if (traceIds.length === 0) return Effect.succeed([])
        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        trace_id,
                        count()                                              AS total_scores,
                        countIf(passed = true AND errored = false)           AS passed_count,
                        countIf(passed = false AND errored = false)          AS failed_count,
                        countIf(errored = true)                              AS errored_count,
                        avg(value)                                           AS avg_value,
                        max(issue_id != '')                                  AS has_issue,
                        groupUniqArray(source)                                AS sources
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND trace_id IN ({traceIds:Array(String)})
                      GROUP BY trace_id`,
              query_params: {
                ...scopeParams(organizationId, projectId),
                traceIds: Array.from(traceIds) as string[],
              },
              format: "JSONEachRow",
            })
            return result.json<TraceRollupRow>()
          })
          .pipe(Effect.map((rows) => rows.map(toTraceRollup)))
      },

      // -- rollupBySessionIds ------------------------------------------------
      rollupBySessionIds: ({ organizationId, projectId, sessionIds, options }) => {
        if (sessionIds.length === 0) return Effect.succeed([])
        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        session_id,
                        count()                                              AS total_scores,
                        countIf(passed = true AND errored = false)           AS passed_count,
                        countIf(passed = false AND errored = false)          AS failed_count,
                        countIf(errored = true)                              AS errored_count,
                        avg(value)                                           AS avg_value,
                        max(issue_id != '')                                  AS has_issue,
                        groupUniqArray(source)                                AS sources
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND session_id IN ({sessionIds:Array(String)})
                      GROUP BY session_id`,
              query_params: {
                ...scopeParams(organizationId, projectId),
                sessionIds: Array.from(sessionIds) as string[],
              },
              format: "JSONEachRow",
            })
            return result.json<SessionRollupRow>()
          })
          .pipe(Effect.map((rows) => rows.map(toSessionRollup)))
      },

      // -- aggregateByIssues -------------------------------------------------
      aggregateByIssues: ({ organizationId, projectId, issueIds, options }) => {
        if (issueIds.length === 0) return Effect.succeed([])
        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        issue_id,
                        count()                                                AS total_occurrences,
                        countIf(created_at >= now() - INTERVAL 1 DAY)          AS recent_occurrences,
                        -- average daily occurrences over the previous 7-day baseline (days 1-8 ago)
                        countIf(
                          created_at >= now() - INTERVAL 8 DAY
                          AND created_at < now() - INTERVAL 1 DAY
                        ) / 7                                                  AS baseline_avg_occurrences,
                        min(created_at)                                        AS first_seen_at,
                        max(created_at)                                        AS last_seen_at
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND issue_id IN ({issueIds:Array(String)})
                      GROUP BY issue_id`,
              query_params: {
                ...scopeParams(organizationId, projectId),
                issueIds: Array.from(issueIds) as string[],
              },
              format: "JSONEachRow",
            })
            return result.json<IssueOccurrenceRow>()
          })
          .pipe(Effect.map((rows) => rows.map(toIssueOccurrence)))
      },

      // -- trendByIssue ------------------------------------------------------
      trendByIssue: ({ organizationId, projectId, issueId, days, options }) => {
        const lookback = days ?? 30
        return chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        toDate(created_at) AS bucket,
                        count()            AS count
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND issue_id = {issueId:FixedString(24)}
                        AND created_at >= now() - INTERVAL {days:UInt32} DAY
                      GROUP BY bucket
                      ORDER BY bucket ASC`,
              query_params: {
                ...scopeParams(organizationId, projectId),
                issueId: issueId as string,
                days: lookback,
              },
              format: "JSONEachRow",
            })
            return result.json<IssueOccurrenceBucketRow>()
          })
          .pipe(Effect.map((rows) => rows.map(toIssueOccurrenceBucket)))
      },
      // Lightweight DELETE (row mask); omits deleted rows from subsequent SELECTs without full part rewrite.
      deleteById: (id: ScoreId) =>
        chSqlClient
          .query(async (client) => {
            await client.command({
              query: "DELETE FROM scores WHERE id = {id:FixedString(24)}",
              query_params: { id },
            })
          })
          .pipe(Effect.asVoid),
    }
  }),
)
