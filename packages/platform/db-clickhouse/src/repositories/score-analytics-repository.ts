import type { ClickHouseClient } from "@clickhouse/client"
import type {
  IssueEscalationSignals,
  IssueEscalationThresholdBucket,
  IssueEscalationThresholdSeries,
  IssueOccurrenceAggregate,
  IssueOccurrenceBucket,
  IssueTagsAggregate,
  IssueTracePage,
  IssueTraceSummary,
  IssueTrendSeries,
  IssueWindowMetric,
  Score,
  ScoreAggregate,
  ScoreAnalyticsOptions,
  ScoreAnalyticsTimeRange,
  ScoreTrendBucket,
  SessionScoreRollup,
  TraceScoreRollup,
} from "@domain/scores"
import { ScoreAnalyticsRepository, SEASONAL_BUCKET_POOLING_HOURS, SEASONAL_HISTORY_WEEKS } from "@domain/scores"
import {
  ChSqlClient,
  type ChSqlClientShape,
  type FilterSet,
  type OrganizationId,
  type ProjectId,
  type ScoreId,
  IssueId as toIssueId,
  toRepositoryError,
  SessionId as toSessionId,
  TraceId as toTraceId,
} from "@domain/shared"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { SCORE_FIELD_REGISTRY } from "../registries/score-fields.ts"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Cap on how many of an issue's most-recent traces we read when aggregating
// tags. Tag distributions converge fast, so a sample of this size captures
// effectively all tag variants while bounding the join cost for noisy issues.
const ISSUE_TAG_TRACE_SAMPLE_LIMIT = 200

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

const HOUR_MS = 60 * 60 * 1000
const WEEK_MS = 7 * 24 * HOUR_MS

/**
 * Builds the 12 (or `(2 * pooling + 1) * weeks`) anchor bucket timestamps
 * used as the 1h-sample centers for the seasonal escalation read. Each
 * anchor's 6h sample sums six consecutive MV rows ending at the anchor.
 * Returned in epoch-milliseconds for caller-side mapping convenience.
 */
const computeSeasonalAnchors = (now: Date): readonly number[] => {
  const alignedHourMs = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS
  const anchors: number[] = []
  for (let week = 1; week <= SEASONAL_HISTORY_WEEKS; week++) {
    for (let offset = -SEASONAL_BUCKET_POOLING_HOURS; offset <= SEASONAL_BUCKET_POOLING_HOURS; offset++) {
      anchors.push(alignedHourMs - week * WEEK_MS + offset * HOUR_MS)
    }
  }
  return anchors
}

const toClickHouseDateTime = (ms: number): string => {
  // `DateTime('UTC')` accepts `"YYYY-MM-DD HH:MM:SS"`.
  const iso = new Date(ms).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
}

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

type RecentCountsRow = {
  issue_id: string
  recent_1h: string
  recent_6h: string
  recent_24h: string
}

type HourlyBucketRow = {
  issue_id: string
  ts_hour: string
  count: string
}

type IssueWindowMetricRow = {
  issue_id: string
  occurrences: string
  first_seen_at: string
  last_seen_at: string
}

type IssueTrendSeriesRow = {
  issue_id: string
  bucket: string
  count: string
}

type IssueTagsRow = {
  issue_id: string
  tags: string[]
}

type CountRow = {
  total: string
}

type IssueTraceSummaryRow = {
  trace_id: string
  last_seen_at: string
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

const toTraceRollup = (row: TraceRollupRow): TraceScoreRollup => ({
  traceId: toTraceId(normalizeCHString(row.trace_id)),
  totalScores: Number(row.total_scores),
  passedCount: Number(row.passed_count),
  failedCount: Number(row.failed_count),
  erroredCount: Number(row.errored_count),
  avgValue: Number(row.avg_value),
  hasIssue: row.has_issue === 1,
  sources: row.sources.map(normalizeCHString),
})

const toSessionRollup = (row: SessionRollupRow): SessionScoreRollup => ({
  sessionId: toSessionId(normalizeCHString(row.session_id)),
  totalScores: Number(row.total_scores),
  passedCount: Number(row.passed_count),
  failedCount: Number(row.failed_count),
  erroredCount: Number(row.errored_count),
  avgValue: Number(row.avg_value),
  hasIssue: row.has_issue === 1,
  sources: row.sources.map(normalizeCHString),
})

const toIssueOccurrence = (row: IssueOccurrenceRow): IssueOccurrenceAggregate => ({
  issueId: toIssueId(normalizeCHString(row.issue_id)),
  totalOccurrences: Number(row.total_occurrences),
  recentOccurrences: Number(row.recent_occurrences),
  baselineAvgOccurrences: Number(row.baseline_avg_occurrences),
  firstSeenAt: parseCHDate(row.first_seen_at),
  lastSeenAt: parseCHDate(row.last_seen_at),
})

const toIssueOccurrenceBucket = (row: IssueOccurrenceBucketRow): IssueOccurrenceBucket => ({
  bucket: row.bucket,
  count: Number(row.count),
})

/**
 * Merge the sliding-recents read and the seasonal-bucket read into the
 * `IssueEscalationSignals` shape consumed by the escalation detector.
 *
 * For each issue, computes the 12 (or `(2P+1) × N_WEEKS`) per-anchor 1h and
 * 6h-span samples by indexing into the MV bucket map, then aggregates them
 * into mean / stddev. The σ floor is applied in the helper, not here — this
 * function emits the raw observation.
 */
const mergeEscalationSignals = (input: {
  readonly issueIds: readonly string[]
  readonly anchors: readonly number[]
  readonly nowMs: number
  readonly recentRows: readonly RecentCountsRow[]
  readonly bucketRows: readonly HourlyBucketRow[]
}): readonly IssueEscalationSignals[] => {
  const { issueIds, anchors, recentRows, bucketRows } = input
  // (issueId, ts_hour_ms) → count
  const bucketMap = new Map<string, Map<number, number>>()
  for (const row of bucketRows) {
    const issueId = normalizeCHString(row.issue_id)
    const tsHourMs = parseCHDate(row.ts_hour).getTime()
    const count = Number(row.count)
    let perIssue = bucketMap.get(issueId)
    if (!perIssue) {
      perIssue = new Map()
      bucketMap.set(issueId, perIssue)
    }
    perIssue.set(tsHourMs, (perIssue.get(tsHourMs) ?? 0) + count)
  }

  const recentByIssue = new Map<string, RecentCountsRow>()
  for (const row of recentRows) {
    recentByIssue.set(normalizeCHString(row.issue_id), row)
  }

  const meanStddev = (values: readonly number[]): { readonly mean: number; readonly stddev: number } => {
    if (values.length === 0) return { mean: 0, stddev: 0 }
    const mean = values.reduce((acc, v) => acc + v, 0) / values.length
    const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
    return { mean, stddev: Math.sqrt(variance) }
  }

  return issueIds.map<IssueEscalationSignals>((issueId) => {
    const recent = recentByIssue.get(issueId)
    const perIssueBuckets = bucketMap.get(issueId) ?? new Map<number, number>()

    const oneHourSamples: number[] = []
    const sixHourPerHourSamples: number[] = []
    const weeksContributing = new Set<number>()

    for (const anchorMs of anchors) {
      const oneH = perIssueBuckets.get(anchorMs) ?? 0
      let sixH = 0
      for (let i = 0; i <= 5; i++) {
        sixH += perIssueBuckets.get(anchorMs - i * HOUR_MS) ?? 0
      }
      oneHourSamples.push(oneH)
      sixHourPerHourSamples.push(sixH / 6)
      if (oneH > 0 || sixH > 0) {
        // Round-to-nearest weeks-ago so anchors offset by ±SEASONAL_BUCKET_POOLING_HOURS
        // within the same prior-week pool all map to the same week index. A floor
        // would dump the `+1h` offset of week N into bucket N-1 and undercount
        // contributing weeks; round keeps the whole pool grouped together, which
        // is the property `samplesCount` is actually measuring.
        const weekIndex = Math.round((input.nowMs - anchorMs) / WEEK_MS)
        weeksContributing.add(weekIndex)
      }
    }

    const oneStats = meanStddev(oneHourSamples)
    const sixStats = meanStddev(sixHourPerHourSamples)

    return {
      issueId: toIssueId(issueId),
      recent1h: recent ? Number(recent.recent_1h) : 0,
      recent6h: recent ? Number(recent.recent_6h) : 0,
      recent24h: recent ? Number(recent.recent_24h) : 0,
      expected1h: oneStats.mean,
      expected6hPerHour: sixStats.mean,
      stddev1h: oneStats.stddev,
      stddev6hPerHour: sixStats.stddev,
      samplesCount: weeksContributing.size,
    }
  })
}

const toIssueWindowMetric = (row: IssueWindowMetricRow): IssueWindowMetric => ({
  issueId: toIssueId(normalizeCHString(row.issue_id)),
  occurrences: Number(row.occurrences),
  firstSeenAt: parseCHDate(row.first_seen_at),
  lastSeenAt: parseCHDate(row.last_seen_at),
})

const SECOND_MS = 1000
const DAYS_PER_WEEK = 7

/**
 * Sample stddev with the same variance floor the detector helper uses, so
 * the chart line matches the live decision rule visually.
 */
const sigmaEffective = (observed: number, expected: number): number =>
  Math.max(observed, Math.sqrt(Math.max(0, expected)), 1.0)

/**
 * Build a `(dow, hour)` → mean/stddev/samples table from the prior-history
 * rows, with the same `(dow, hour ± SEASONAL_BUCKET_POOLING_HOURS)` pool
 * across `SEASONAL_HISTORY_WEEKS` prior weeks used by the live detector.
 *
 * Returned as a 7×24 grid so per-hour lookups during bucket projection are
 * O(1) and the projection cost scales with the number of chart hours, not
 * with the size of the history.
 */
const buildSeasonalGrid = (rows: readonly HourlyBucketRow[]): { mean: number; sigma: number; samples: number }[][] => {
  // grid[dow][hour] = { sums: number[], samples: number } where each entry is
  // the bucket count for one prior week's matching (dow, hour) cell. Stored
  // as raw counts so we can later sum them into the ±1h pool without losing
  // the originals.
  const cells: number[][][] = Array.from({ length: DAYS_PER_WEEK }, () =>
    Array.from({ length: 24 }, () => [] as number[]),
  )

  for (const row of rows) {
    const ts = parseCHDate(row.ts_hour)
    const dow = ts.getUTCDay()
    const hour = ts.getUTCHours()
    const cell = cells[dow]?.[hour]
    if (cell) cell.push(Number(row.count))
  }

  const grid: { mean: number; sigma: number; samples: number }[][] = Array.from({ length: DAYS_PER_WEEK }, () =>
    Array.from({ length: 24 }, () => ({ mean: 0, sigma: 0, samples: 0 })),
  )

  for (let dow = 0; dow < DAYS_PER_WEEK; dow++) {
    for (let hour = 0; hour < 24; hour++) {
      const pooled: number[] = []
      for (let offset = -SEASONAL_BUCKET_POOLING_HOURS; offset <= SEASONAL_BUCKET_POOLING_HOURS; offset++) {
        // Hour-wrap intentionally crosses into the adjacent dow so the pool
        // for (Mon, 00) includes (Sun, 23) and (Mon, 01) — matches what the
        // live detector does when its anchors fall near midnight.
        const wrappedDow = (dow + Math.floor((hour + offset) / 24) + DAYS_PER_WEEK) % DAYS_PER_WEEK
        const wrappedHour = (((hour + offset) % 24) + 24) % 24
        const samples = cells[wrappedDow]?.[wrappedHour]
        if (samples) pooled.push(...samples)
      }

      const cell = grid[dow]?.[hour]
      if (!cell) continue
      if (pooled.length === 0) continue

      const mean = pooled.reduce((acc, v) => acc + v, 0) / pooled.length
      const variance = pooled.reduce((acc, v) => acc + (v - mean) ** 2, 0) / pooled.length
      cell.mean = mean
      cell.sigma = Math.sqrt(variance)
      cell.samples = pooled.length
    }
  }

  return grid
}

/**
 * Project a stable entry-band threshold across the histogram's buckets.
 *
 * For each bucket spanning `bucketHours` hours, the per-hour expected counts
 * are summed and the per-hour variances are added in quadrature (independent
 * hours), then the 1h-band `k_short` and the 6h-band `k_long = max(1,
 * k_short - 1)` are both applied. The line is the max of the two — the
 * harder one to clear — which matches what the detector's AND-of-windows
 * trip rule effectively asks the bucket to cross.
 *
 * Hours that fall on a `(dow, hour)` cell with no contributing samples
 * still contribute the σ floor (≈1.0 occurrences) to the bucket's variance.
 * That keeps the line drawn across "dead" stretches at a low but
 * informative level — an event in a normally-quiet bin really is anomalous
 * — instead of breaking the line every time the histogram crosses an
 * empty `(dow, hour)`. The caller short-circuits to `Number.NaN` when the
 * issue has no history at all anywhere in the pool.
 */
const projectBucketThresholds = (input: {
  readonly grid: readonly (readonly { readonly mean: number; readonly sigma: number; readonly samples: number }[])[]
  readonly bucketStartMs: number
  readonly bucketEndMs: number
  readonly kShort: number
}): number => {
  const { grid, bucketStartMs, bucketEndMs, kShort } = input
  const kLong = Math.max(1, kShort - 1)
  let sumExpected = 0
  let sumVariance = 0

  for (let cursor = bucketStartMs; cursor < bucketEndMs; cursor += HOUR_MS) {
    const d = new Date(cursor)
    const dow = d.getUTCDay()
    const hour = d.getUTCHours()
    const cell = grid[dow]?.[hour]
    const expected = cell?.mean ?? 0
    const sigmaObs = cell?.sigma ?? 0
    sumExpected += expected
    const sigmaEff = sigmaEffective(sigmaObs, expected)
    sumVariance += sigmaEff * sigmaEff
  }

  const bucketSigma = Math.sqrt(sumVariance)
  const t1h = sumExpected + kShort * bucketSigma
  const t6h = sumExpected + kLong * bucketSigma
  return Math.max(t1h, t6h)
}

const toIssueTrendSeries = (rows: readonly IssueTrendSeriesRow[]): readonly IssueTrendSeries[] => {
  const bucketsByIssueId = new Map<string, IssueOccurrenceBucket[]>()

  for (const row of rows) {
    const issueId = normalizeCHString(row.issue_id)
    const buckets = bucketsByIssueId.get(issueId) ?? []
    buckets.push({
      bucket: row.bucket,
      count: Number(row.count),
    })
    bucketsByIssueId.set(issueId, buckets)
  }

  return [...bucketsByIssueId.entries()].map(([issueId, buckets]) => ({
    issueId: toIssueId(issueId),
    buckets,
  }))
}

const toIssueTagsAggregate = (row: IssueTagsRow): IssueTagsAggregate => ({
  issueId: toIssueId(normalizeCHString(row.issue_id)),
  tags: row.tags.map(normalizeCHString).filter((tag) => tag.length > 0),
})

const toIssueTraceSummary = (row: IssueTraceSummaryRow): IssueTraceSummary => ({
  traceId: toTraceId(normalizeCHString(row.trace_id)),
  lastSeenAt: parseCHDate(row.last_seen_at),
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

const buildScoreCreatedAtTimeRange = (
  timeRange: ScoreAnalyticsTimeRange | undefined,
  prefix: string,
): { clauses: string[]; params: Record<string, unknown> } => {
  const clauses: string[] = []
  const params: Record<string, unknown> = {}

  if (timeRange?.from) {
    clauses.push(`created_at >= toDateTime64({${prefix}_from:String}, 3, 'UTC')`)
    params[`${prefix}_from`] = toClickHouseDateTime64(timeRange.from)
  }

  if (timeRange?.to) {
    clauses.push(`created_at <= toDateTime64({${prefix}_to:String}, 3, 'UTC')`)
    params[`${prefix}_to`] = toClickHouseDateTime64(timeRange.to)
  }

  return { clauses, params }
}

const buildIssueAnalyticsWhere = (input: {
  readonly filters: FilterSet | undefined
  readonly timeRange: ScoreAnalyticsTimeRange | undefined
  readonly issueIds: readonly string[] | undefined
  readonly paramPrefix: string
}): { clauses: string[]; params: Record<string, unknown> } => {
  const filterResult = input.filters
    ? buildClickHouseWhere(input.filters, SCORE_FIELD_REGISTRY, { paramPrefix: input.paramPrefix })
    : { clauses: [], params: {} }
  const timeRangeResult = buildScoreCreatedAtTimeRange(input.timeRange, input.paramPrefix)
  const clauses = ["issue_id != ''", ...filterResult.clauses, ...timeRangeResult.clauses]
  const params = {
    ...filterResult.params,
    ...timeRangeResult.params,
  }

  if (input.issueIds && input.issueIds.length > 0) {
    clauses.push(`issue_id IN ({${input.paramPrefix}_issueIds:Array(String)})`)
    params[`${input.paramPrefix}_issueIds`] = input.issueIds
  }

  return { clauses, params }
}

// ---------------------------------------------------------------------------
// Repository implementation
// ---------------------------------------------------------------------------

export const ScoreAnalyticsRepositoryLive = Layer.effect(
  ScoreAnalyticsRepository,
  Effect.gen(function* () {
    const deleteScore = (id: ScoreId) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client, organizationId) => {
            await client.command({
              query: "DELETE FROM scores WHERE organization_id = {organizationId:String} AND id = {id:FixedString(24)}",
              query_params: { organizationId, id },
            })
          })
          .pipe(Effect.asVoid)
      })

    return {
      // -- existsById --------------------------------------------------------
      existsById: (id: ScoreId) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client, organizationId) => {
              const result = await client.query({
                query:
                  "SELECT id FROM scores WHERE organization_id = {organizationId:String} AND id = {id:FixedString(24)} LIMIT 1",
                query_params: { organizationId, id },
                format: "JSONEachRow",
              })
              return result.json<{ id: string }>()
            })
            .pipe(Effect.map((rows) => rows.length > 0))
        }),

      // TODO(repositories): rename insert -> save to keep repository write
      // verbs consistent across append-only and upsert-backed stores.
      insert: (score: Score) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient.query(async (client) => {
            await client.insert({
              table: "scores",
              values: [toAnalyticsRow(score)],
              format: "JSONEachRow",
            })
          })
        }),

      // -- aggregateByProject ------------------------------------------------
      aggregateByProject: ({ organizationId, projectId, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
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
            .pipe(Effect.map((rows) => toAggregate(rows[0])))
        }),

      // -- aggregateBySource -------------------------------------------------
      aggregateBySource: ({ organizationId, projectId, source, sourceId, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
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
            .pipe(Effect.map((rows) => toAggregate(rows[0])))
        }),

      // -- trendBySource -----------------------------------------------------
      trendBySource: ({ organizationId, projectId, source, sourceId, days, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const lookback = days ?? 14
          return yield* chSqlClient
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
        }),

      // -- trendByProject ----------------------------------------------------
      trendByProject: ({ organizationId, projectId, days, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const lookback = days ?? 14
          return yield* chSqlClient
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
        }),

      // -- rollupByTraceIds --------------------------------------------------
      rollupByTraceIds: ({ organizationId, projectId, traceIds, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (traceIds.length === 0) return []
          return yield* chSqlClient
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
        }),

      // -- rollupBySessionIds ------------------------------------------------
      rollupBySessionIds: ({ organizationId, projectId, sessionIds, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (sessionIds.length === 0) return []
          return yield* chSqlClient
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
        }),

      // -- aggregateByIssues -------------------------------------------------
      aggregateByIssues: ({ organizationId, projectId, issueIds, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (issueIds.length === 0) return []
          return yield* chSqlClient
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
        }),

      // -- escalationSignalsByIssues -----------------------------------------
      // Two reads merged in TypeScript:
      //   1. Sliding 1h / 6h / 24h counts from raw `scores` (single-issue PK
      //      lookup, tiny scan over the trailing 24h).
      //   2. Same-(dow, hour ± 1) bucket counts from `scores_hourly_buckets`
      //      for the prior `SEASONAL_HISTORY_WEEKS` weeks. 6h-band samples are
      //      reconstructed from six consecutive bucket rows ending at each
      //      anchor; aggregation to mean/stddev happens in TS because the
      //      sample set is small (12 anchors × N issues).
      escalationSignalsByIssues: ({ organizationId, projectId, issueIds, now, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (issueIds.length === 0) return []
          const resolvedNow = now ?? new Date()
          const nowMs = resolvedNow.getTime()
          const anchors = computeSeasonalAnchors(resolvedNow)
          // Bind the SQL sliding-window edges to the same `now` the JS side uses
          // for anchor computation; otherwise tests overriding `now` would
          // compute anchors against the override while the SQL still reads
          // `now()` from the DB clock, silently desyncing the two halves of
          // the read.
          const nowParam = toClickHouseDateTime(nowMs)
          // Buckets we need from the MV: each anchor + the 5 hourly buckets
          // preceding it (for the 6h-span sum). Deduplicated since 6h spans
          // can overlap across adjacent hour-offsets.
          const neededBucketSet = new Set<number>()
          for (const anchorMs of anchors) {
            for (let i = 0; i <= 5; i++) neededBucketSet.add(anchorMs - i * HOUR_MS)
          }
          const neededBuckets = [...neededBucketSet].map(toClickHouseDateTime)

          const [recentRows, bucketRows] = yield* Effect.all(
            [
              chSqlClient.query<RecentCountsRow[]>(async (client) => {
                const result = await client.query({
                  query: `SELECT
                          issue_id,
                          countIf(created_at >= toDateTime({now:String}, 'UTC') - INTERVAL 1 HOUR) AS recent_1h,
                          countIf(created_at >= toDateTime({now:String}, 'UTC') - INTERVAL 6 HOUR) AS recent_6h,
                          countIf(created_at >= toDateTime({now:String}, 'UTC') - INTERVAL 1 DAY)  AS recent_24h
                        FROM scores
                        WHERE ${scopeClause(options)}
                          AND issue_id IN ({issueIds:Array(String)})
                          AND created_at >= toDateTime({now:String}, 'UTC') - INTERVAL 1 DAY
                        GROUP BY issue_id`,
                  query_params: {
                    ...scopeParams(organizationId, projectId),
                    issueIds: Array.from(issueIds) as string[],
                    now: nowParam,
                  },
                  format: "JSONEachRow",
                })
                return result.json<RecentCountsRow>()
              }),
              chSqlClient.query<HourlyBucketRow[]>(async (client) => {
                const result = await client.query({
                  query: `SELECT
                          issue_id,
                          ts_hour,
                          sum(count) AS count
                        FROM scores_hourly_buckets
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND issue_id IN ({issueIds:Array(String)})
                          AND ts_hour IN ({tsHours:Array(DateTime)})
                        GROUP BY issue_id, ts_hour`,
                  query_params: {
                    organizationId: organizationId as string,
                    projectId: projectId as string,
                    issueIds: Array.from(issueIds) as string[],
                    tsHours: neededBuckets,
                  },
                  format: "JSONEachRow",
                })
                return result.json<HourlyBucketRow>()
              }),
            ],
            { concurrency: 2 },
          )

          return mergeEscalationSignals({
            issueIds: issueIds.map((id) => id as string),
            anchors,
            nowMs,
            recentRows,
            bucketRows,
          })
        }),

      // -- aggregateTagsByIssues ---------------------------------------------
      // Performance shape (read carefully before relaxing the bounds):
      //   * `scores` is partitioned by `toYYYYMM(created_at)` and PK is
      //     `(org, project, created_at)`. `issue_id` is NOT in the sort key,
      //     so without a `created_at` filter `WHERE issue_id IN (...)` does
      //     a full scan of every monthly partition for the (org, project) —
      //     a year-old project means ~12 partitions × millions of rows.
      //   * `traces` is partitioned by `toYYYYMM(min_start_time)` with a
      //     `minmax` skip index on `min_start_time`; PK is `(org, project)`,
      //     sparse — `trace_id IN (...)` alone still scans every (org,
      //     project) granule of history because the PK can't position by
      //     trace_id. A `min_start_time` filter prunes partitions hard.
      //   * The `timeRange` argument is therefore REQUIRED — both subqueries
      //     filter on it. The use-case picks the bound (typically a 30d
      //     fallback if the operator hasn't selected one).
      //   * `LIMIT N BY issue_id` further caps the per-issue trace sample so
      //     a single noisy issue can't blow up the join.
      //
      // TODO(perf): long-term this should be served by a dedicated per-issue
      // tags aggregating MV (insert-time work, O(1) read). Open questions
      // before building it: (a) which side denormalizes — `tags` onto
      // `scores`, or `issue_id` onto `spans`/`traces`? (b) how to handle
      // async issue clustering (an issue id is assigned after a score row
      // already exists), (c) backfill plan for historical data. Discussed
      // in PR #2893 review threads.
      aggregateTagsByIssues: ({ organizationId, projectId, issueIds, timeRange, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (issueIds.length === 0) return []

          // The IssueTagsTimeRange type guarantees `from`; `to` is optional and
          // only emitted when present.
          const scoresClauses = [
            "created_at >= toDateTime64({tags_scores_from:String}, 3, 'UTC')",
            ...(timeRange.to ? ["created_at <= toDateTime64({tags_scores_to:String}, 3, 'UTC')"] : []),
          ]
          const tracesClauses = [
            "min_start_time >= toDateTime64({tags_traces_from:String}, 3, 'UTC')",
            ...(timeRange.to ? ["min_start_time <= toDateTime64({tags_traces_to:String}, 3, 'UTC')"] : []),
          ]
          const timeParams: Record<string, unknown> = {
            tags_scores_from: toClickHouseDateTime64(timeRange.from),
            tags_traces_from: toClickHouseDateTime64(timeRange.from),
          }
          if (timeRange.to) {
            timeParams.tags_scores_to = toClickHouseDateTime64(timeRange.to)
            timeParams.tags_traces_to = toClickHouseDateTime64(timeRange.to)
          }

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `WITH issue_traces AS (
                        SELECT issue_id, trace_id
                        FROM (
                          SELECT issue_id, trace_id, max(created_at) AS last_seen_at
                          FROM scores
                          WHERE ${scopeClause(options)}
                            AND issue_id IN ({issueIds:Array(String)})
                            AND trace_id != ''
                            AND ${scoresClauses.join(" AND ")}
                          GROUP BY issue_id, trace_id
                          ORDER BY issue_id, last_seen_at DESC
                          LIMIT {tracesPerIssue:UInt32} BY issue_id
                        )
                      ),
                      trace_tags AS (
                        SELECT trace_id, groupUniqArrayArray(tags) AS tags
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND trace_id IN (SELECT trace_id FROM issue_traces)
                          AND ${tracesClauses.join(" AND ")}
                        GROUP BY trace_id
                      )
                      SELECT
                        issue_traces.issue_id AS issue_id,
                        groupUniqArrayArray(trace_tags.tags) AS tags
                      FROM issue_traces
                      INNER JOIN trace_tags USING (trace_id)
                      GROUP BY issue_traces.issue_id`,
                query_params: {
                  ...scopeParams(organizationId, projectId),
                  issueIds: Array.from(issueIds) as string[],
                  tracesPerIssue: ISSUE_TAG_TRACE_SAMPLE_LIMIT,
                  ...timeParams,
                },
                format: "JSONEachRow",
              })
              return result.json<IssueTagsRow>()
            })
            .pipe(Effect.map((rows) => rows.map(toIssueTagsAggregate)))
        }),

      // -- trendByIssue ------------------------------------------------------
      trendByIssue: ({ organizationId, projectId, issueId, days, bucketSeconds, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const lookback = days ?? 30
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                // Bucket is emitted as an ISO-8601 UTC timestamp (`...T00:00:00.000Z`) regardless
                // of the chosen interval. Daily callers that historically expected `YYYY-MM-DD`
                // adapt at the consumer; using a single format keeps sub-day buckets
                // (e.g. 12h trend on the issue detail drawer) free of CH string-coercion quirks.
                query: `SELECT
                        formatDateTime(
                          toStartOfInterval(created_at, INTERVAL {bucketSeconds:UInt32} SECOND),
                          '%Y-%m-%dT%H:%i:%S.000Z'
                        ) AS bucket,
                        count() AS count
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
                  bucketSeconds,
                },
                format: "JSONEachRow",
              })
              return result.json<IssueOccurrenceBucketRow>()
            })
            .pipe(Effect.map((rows) => rows.map(toIssueOccurrenceBucket)))
        }),
      listIssueWindowMetrics: ({ organizationId, projectId, filters, timeRange, issueIds, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (issueIds && issueIds.length === 0) {
            return []
          }

          const { clauses, params } = buildIssueAnalyticsWhere({
            filters,
            timeRange,
            issueIds: issueIds ? Array.from(issueIds) : undefined,
            paramPrefix: "iw",
          })
          const extraWhere = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        issue_id,
                        count()         AS occurrences,
                        min(created_at) AS first_seen_at,
                        max(created_at) AS last_seen_at
                      FROM scores
                      WHERE ${scopeClause(options)}${extraWhere}
                      GROUP BY issue_id`,
                query_params: {
                  ...scopeParams(organizationId, projectId),
                  ...params,
                },
                format: "JSONEachRow",
              })
              return result.json<IssueWindowMetricRow>()
            })
            .pipe(Effect.map((rows) => rows.map(toIssueWindowMetric)))
        }),
      histogramByIssues: ({ organizationId, projectId, issueIds, filters, timeRange, bucketSeconds, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (issueIds.length === 0) {
            return []
          }

          const { clauses, params } = buildIssueAnalyticsWhere({
            filters,
            timeRange,
            issueIds: Array.from(issueIds),
            paramPrefix: "ih",
          })
          const extraWhere = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                // Same ISO-8601 UTC bucket format as `trendByIssue` — see comment there.
                query: `SELECT
                        formatDateTime(
                          toStartOfInterval(created_at, INTERVAL {bucketSeconds:UInt32} SECOND),
                          '%Y-%m-%dT%H:%i:%S.000Z'
                        ) AS bucket,
                        count() AS count
                      FROM scores
                      WHERE ${scopeClause(options)}${extraWhere}
                      GROUP BY bucket
                      ORDER BY bucket ASC`,
                query_params: {
                  ...scopeParams(organizationId, projectId),
                  ...params,
                  bucketSeconds,
                },
                format: "JSONEachRow",
              })
              return result.json<IssueOccurrenceBucketRow>()
            })
            .pipe(Effect.map((rows) => rows.map(toIssueOccurrenceBucket)))
        }),
      escalationThresholdHistogramByIssues: ({
        organizationId,
        projectId,
        issueIds,
        timeRange,
        bucketSeconds,
        kShort,
      }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (issueIds.length === 0) return []
          // Sub-hour buckets aren't supported — the MV is hourly so anything
          // finer than that would round to the same band repeated across the
          // bucket and read more like noise than a meaningful line.
          if (bucketSeconds < 3600) return []
          if (!timeRange.from || !timeRange.to) return []

          const histogramStartMs = timeRange.from.getTime()
          const histogramEndMs = timeRange.to.getTime()
          // Anchor the seasonal pool on the chart's end, not its start. This
          // matches the live detector's `now - week*W` anchors when the chart
          // ends at "now", and — more importantly — newer issues whose data
          // is contained in the chart window still get a meaningful line.
          // Anchoring on `from` would require ≥4 weeks of pre-chart history
          // and silently emit empty thresholds for anything younger.
          const historyEndMs = histogramEndMs
          const historyStartMs = historyEndMs - SEASONAL_HISTORY_WEEKS * WEEK_MS

          const bucketRows = yield* chSqlClient.query<HourlyBucketRow[]>(async (client) => {
            const result = await client.query({
              query: `SELECT
                      issue_id,
                      ts_hour,
                      sum(count) AS count
                    FROM scores_hourly_buckets
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND issue_id IN ({issueIds:Array(String)})
                      AND ts_hour >= toDateTime({historyStart:String}, 'UTC')
                      AND ts_hour <  toDateTime({historyEnd:String}, 'UTC')
                    GROUP BY issue_id, ts_hour`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                issueIds: Array.from(issueIds) as string[],
                historyStart: toClickHouseDateTime(historyStartMs),
                historyEnd: toClickHouseDateTime(historyEndMs),
              },
              format: "JSONEachRow",
            })
            return result.json<HourlyBucketRow>()
          })

          // Group history rows by issue, then project per-issue thresholds.
          const rowsByIssue = new Map<string, HourlyBucketRow[]>()
          for (const row of bucketRows) {
            const issueId = normalizeCHString(row.issue_id)
            const list = rowsByIssue.get(issueId) ?? []
            list.push(row)
            rowsByIssue.set(issueId, list)
          }

          // Bucket scaffold aligned to `toStartOfInterval(... , INTERVAL N SECOND)`
          // — same alignment ClickHouse uses for `histogramByIssues`, so each
          // threshold bucket's key matches its histogram counterpart 1:1.
          const bucketWidthMs = bucketSeconds * SECOND_MS
          const firstBucketStartMs = Math.floor(histogramStartMs / bucketWidthMs) * bucketWidthMs
          const bucketStarts: number[] = []
          for (let start = firstBucketStartMs; start < histogramEndMs; start += bucketWidthMs) {
            bucketStarts.push(start)
          }

          return issueIds.map<IssueEscalationThresholdSeries>((issueId) => {
            const issueRows = rowsByIssue.get(issueId as string) ?? []
            // No history at all in the pool → don't fabricate a line. The
            // floor σ would still produce a low constant threshold, but it
            // would carry no real meaning and the renderer can drop it.
            const hasAnyHistory = issueRows.length > 0
            const grid = buildSeasonalGrid(issueRows)

            const buckets: IssueEscalationThresholdBucket[] = bucketStarts.map((bucketStartMs) => {
              const bucketEndMs = bucketStartMs + bucketWidthMs
              const thresholdCount = hasAnyHistory
                ? projectBucketThresholds({
                    grid,
                    bucketStartMs,
                    bucketEndMs,
                    kShort,
                  })
                : Number.NaN
              const iso = `${new Date(bucketStartMs).toISOString().slice(0, 19)}.000Z`
              return { bucket: iso, thresholdCount }
            })
            return { issueId, buckets }
          })
        }),
      trendByIssues: ({ organizationId, projectId, issueIds, filters, timeRange, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          if (issueIds.length === 0) {
            return []
          }

          const { clauses, params } = buildIssueAnalyticsWhere({
            filters,
            timeRange,
            issueIds: Array.from(issueIds),
            paramPrefix: "it",
          })
          const extraWhere = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        issue_id,
                        toDate(created_at) AS bucket,
                        count()            AS count
                      FROM scores
                      WHERE ${scopeClause(options)}${extraWhere}
                      GROUP BY issue_id, bucket
                      ORDER BY issue_id ASC, bucket ASC`,
                query_params: {
                  ...scopeParams(organizationId, projectId),
                  ...params,
                },
                format: "JSONEachRow",
              })
              return result.json<IssueTrendSeriesRow>()
            })
            .pipe(Effect.map(toIssueTrendSeries))
        }),
      countDistinctTracesByTimeRange: ({ organizationId, projectId, timeRange, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const { clauses, params } = buildScoreCreatedAtTimeRange(timeRange, "trace_window")
          const extraWhere = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT uniqExact(trace_id) AS total
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND trace_id != ''${extraWhere}`,
                query_params: {
                  ...scopeParams(organizationId, projectId),
                  ...params,
                },
                format: "JSONEachRow",
              })
              return result.json<CountRow>()
            })
            .pipe(Effect.map((rows) => Number(rows[0]?.total ?? 0)))
        }),
      listTracesByIssue: ({ organizationId, projectId, issueId, limit, offset, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const pageLimit = limit ?? 25
          const pageOffset = offset ?? 0

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        trace_id,
                        max(created_at) AS last_seen_at
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND issue_id = {issueId:FixedString(24)}
                        AND trace_id != ''
                      GROUP BY trace_id
                      ORDER BY last_seen_at DESC, trace_id DESC
                      LIMIT {limit:UInt32}
                      OFFSET {offset:UInt32}`,
                query_params: {
                  ...scopeParams(organizationId, projectId),
                  issueId: issueId as string,
                  limit: pageLimit + 1,
                  offset: pageOffset,
                },
                format: "JSONEachRow",
              })
              return result.json<IssueTraceSummaryRow>()
            })
            .pipe(
              Effect.map((rows): IssueTracePage => {
                const items = rows.slice(0, pageLimit).map(toIssueTraceSummary)
                return {
                  items,
                  hasMore: rows.length > pageLimit,
                  limit: pageLimit,
                  offset: pageOffset,
                }
              }),
              Effect.mapError((error) => toRepositoryError(error, "listTracesByIssue")),
            )
        }),
      countTracesByIssue: ({ organizationId, projectId, issueId, options }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT uniqExact(trace_id) AS total
                      FROM scores
                      WHERE ${scopeClause(options)}
                        AND issue_id = {issueId:FixedString(24)}
                        AND trace_id != ''`,
                query_params: {
                  ...scopeParams(organizationId, projectId),
                  issueId: issueId as string,
                },
                format: "JSONEachRow",
              })
              return result.json<CountRow>()
            })
            .pipe(
              Effect.map((rows) => Number(rows[0]?.total ?? 0)),
              Effect.mapError((error) => toRepositoryError(error, "countTracesByIssue")),
            )
        }),
      // Lightweight DELETE (row mask); omits deleted rows from subsequent SELECTs without full part rewrite.
      delete: deleteScore,
    }
  }),
)
