import type { ClickHouseClient } from "@clickhouse/client"
import type {
  MemoryActivityWriteBucket,
  MemoryAnalyticsRepositoryShape,
  MemoryAnalyticsScope,
  MemoryStoreMetricSortField,
  MemoryStoreMetricsItem,
} from "@domain/memories"
import { MemoryAnalyticsRepository } from "@domain/memories"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { formatCHDate, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

const num = (value: string | number | null | undefined): number => Number(value ?? 0)

const SCOPE = `organization_id = {organizationId:String} AND project_id = {projectId:String}`
const WINDOW = `AND end_time >= {from:DateTime64(6, 'UTC')} AND end_time <= {to:DateTime64(6, 'UTC')}`

// Retry dedup: `memory_events` is append-only, so a re-run projection can write
// duplicate rows. Collapse to one per (trace, span, store, record) — newest
// ingested wins — before any additive count. Only the four data-op kinds drive
// the store set (store lifecycle events are not "activity").
const DEDUPED_WINDOW = `
  SELECT store_id, record_id, change_kind, token_count, record_count, span_id, session_id, user_id, trace_id, end_time
  FROM memory_events
  WHERE ${SCOPE} ${WINDOW} AND change_kind IN ('add', 'update', 'remove', 'read')
  ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
  LIMIT 1 BY trace_id, span_id, store_id, record_id
`

// Fixed map — never interpolate the sort input into ORDER BY. Values are output
// aliases / expressions of the store-metrics query. Ratio/dead/zeroHit/churn
// divide by `greatest(_, 1)` so a zero denominator sorts as 0 (no NULLs).
const METRIC_SORT_EXPRS: Record<MemoryStoreMetricSortField, string> = {
  records: "live_records",
  tokens: "live_tokens",
  sessions: "session_count",
  users: "user_count",
  writes: "writes",
  reads: "reads",
  ratio: "reads / greatest(writes, 1)",
  dead: "dead_records / greatest(live_records, 1)",
  zeroHit: "zero_hit_searches / greatest(searches, 1)",
  churn: "update_events / greatest(records_touched, 1)",
  lastActivity: "last_activity_at",
}

type StoreMetricsRow = {
  readonly store_id: string
  readonly live_records: string | number
  readonly live_tokens: string | number
  readonly dead_records: string | number
  readonly writes: string | number
  readonly update_events: string | number
  readonly reads: string | number
  readonly searches: string | number
  readonly zero_hit_searches: string | number
  readonly records_touched: string | number
  readonly session_count: string | number
  readonly user_count: string | number
  readonly last_activity_at: string
}

type TrendRow = {
  readonly store_id: string
  readonly bucket_start: string
  readonly writes: string | number
}

type TokensAtRow = {
  readonly store_id: string
  readonly tokens: string | number
}

const scopeParams = (scope: MemoryAnalyticsScope) => ({
  organizationId: scope.organizationId as string,
  projectId: scope.projectId as string,
})

const rangeParams = (scope: MemoryAnalyticsScope) => ({
  ...scopeParams(scope),
  from: formatCHDate(scope.from),
  to: formatCHDate(scope.to),
})

export const MemoryAnalyticsRepositoryLive = Layer.effect(
  MemoryAnalyticsRepository,
  Effect.gen(function* () {
    const listStoresWithMetrics: MemoryAnalyticsRepositoryShape["listStoresWithMetrics"] = ({
      organizationId,
      projectId,
      from,
      to,
      sortBy,
      sortDirection,
      limit,
      offset,
      trendBucketSeconds,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const scope = { organizationId, projectId, from, to }
        const sortExpr = METRIC_SORT_EXPRS[sortBy]
        const orderDir = sortDirection === "asc" ? "ASC" : "DESC"

        const { pageRows, totalCount } = yield* chSqlClient
          .query(async (client) => {
            const [listResult, countResult] = await Promise.all([
              client.query({
                query: `
                  WITH
                  we AS (
                    SELECT
                      store_id,
                      countIf(change_kind IN ('add', 'update', 'remove'))                 AS writes,
                      countIf(change_kind = 'update')                                     AS update_events,
                      countIf(change_kind = 'read' AND record_count > 0)                  AS reads,
                      uniqExactIf(span_id, change_kind = 'read')                          AS searches,
                      uniqExactIf(span_id, change_kind = 'read' AND record_count = 0)     AS zero_hit_searches,
                      uniqExactIf(record_id, change_kind IN ('add', 'update', 'remove'))  AS records_touched,
                      uniqExactIf(session_id, session_id != '')                           AS session_count,
                      uniqExactIf(user_id, user_id != '')                                 AS user_count,
                      max(end_time)                                                       AS last_activity_at
                    FROM ( ${DEDUPED_WINDOW} )
                    GROUP BY store_id
                  ),
                  cs AS (
                    SELECT store_id, count() AS live_records, sum(token_count) AS live_tokens, countIf(never_read) AS dead_records
                    FROM (
                      SELECT
                        store_id,
                        token_count,
                        (store_id, record_id) NOT IN (
                          SELECT store_id, record_id FROM memory_events
                          WHERE ${SCOPE} AND change_kind = 'read' AND record_count > 0
                        ) AS never_read
                      FROM (
                        SELECT store_id, record_id, token_count, change_kind, end_time
                        FROM memory_current
                        WHERE ${SCOPE}
                        ORDER BY store_id, record_id, end_time DESC
                        LIMIT 1 BY store_id, record_id
                      )
                      WHERE change_kind != 'remove'
                    )
                    GROUP BY store_id
                  )
                  SELECT
                    we.store_id           AS store_id,
                    cs.live_records       AS live_records,
                    cs.live_tokens        AS live_tokens,
                    cs.dead_records       AS dead_records,
                    we.writes             AS writes,
                    we.update_events      AS update_events,
                    we.reads              AS reads,
                    we.searches           AS searches,
                    we.zero_hit_searches  AS zero_hit_searches,
                    we.records_touched    AS records_touched,
                    we.session_count      AS session_count,
                    we.user_count         AS user_count,
                    we.last_activity_at   AS last_activity_at
                  FROM we
                  LEFT JOIN cs ON we.store_id = cs.store_id
                  ORDER BY ${sortExpr} ${orderDir}, we.store_id ASC
                  LIMIT {limit:UInt32} OFFSET {offset:UInt32}`,
                query_params: { ...rangeParams(scope), limit: limit + 1, offset },
                format: "JSONEachRow",
              }),
              client.query({
                query: `SELECT uniqExact(store_id) AS total FROM ( ${DEDUPED_WINDOW} )`,
                query_params: rangeParams(scope),
                format: "JSONEachRow",
              }),
            ])
            const listRows = await listResult.json<StoreMetricsRow>()
            const countRows = await countResult.json<{ total: string | number }>()
            return { pageRows: listRows, totalCount: num(countRows[0]?.total) }
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "MemoryAnalyticsRepository.listStoresWithMetrics")))

        const hasMore = pageRows.length > limit
        const rows = hasMore ? pageRows.slice(0, limit) : pageRows
        const storeIds = rows.map((row) => row.store_id)

        // Net growth and the per-row trend are page-scoped — computed only for
        // the returned store ids, so the two ledger boundary reconstructions
        // stay O(page) instead of scanning every store.
        const { trendByStore, tokensFrom, tokensTo } =
          storeIds.length === 0
            ? {
                trendByStore: new Map<string, MemoryActivityWriteBucket[]>(),
                tokensFrom: new Map<string, number>(),
                tokensTo: new Map<string, number>(),
              }
            : yield* chSqlClient
                .query(async (client) => {
                  // Inner subquery so `change_kind`/`end_time` in WHERE bind to
                  // the columns, not the `argMax(...) AS change_kind` alias
                  // (ILLEGAL_AGGREGATION otherwise) — same shape as readManifestAt.
                  const tokensAtQuery = `
                    SELECT store_id, sum(token_count) AS tokens
                    FROM (
                      SELECT store_id, record_id,
                             argMax(token_count, end_time) AS token_count,
                             argMax(change_kind, end_time) AS change_kind
                      FROM (
                        SELECT store_id, record_id, token_count, change_kind, end_time
                        FROM memory_events
                        WHERE ${SCOPE} AND change_kind IN ('add', 'update', 'remove')
                          AND store_id IN {storeIds:Array(String)} AND end_time <= {at:DateTime64(6, 'UTC')}
                      )
                      GROUP BY store_id, record_id
                      HAVING change_kind != 'remove'
                    )
                    GROUP BY store_id`
                  const [trendResult, fromResult, toResult] = await Promise.all([
                    client.query({
                      query: `SELECT
                                store_id,
                                toDateTime(intDiv(toUnixTimestamp(end_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32}, 'UTC') AS bucket_start,
                                count() AS writes
                              FROM (
                                SELECT store_id, end_time
                                FROM ( ${DEDUPED_WINDOW} )
                                WHERE change_kind IN ('add', 'update', 'remove') AND store_id IN {storeIds:Array(String)}
                              )
                              GROUP BY store_id, bucket_start
                              ORDER BY store_id ASC, bucket_start ASC`,
                      query_params: { ...rangeParams(scope), storeIds, bucketSeconds: trendBucketSeconds },
                      format: "JSONEachRow",
                    }),
                    client.query({
                      query: tokensAtQuery,
                      query_params: { ...scopeParams(scope), storeIds, at: formatCHDate(from) },
                      format: "JSONEachRow",
                    }),
                    client.query({
                      query: tokensAtQuery,
                      query_params: { ...scopeParams(scope), storeIds, at: formatCHDate(to) },
                      format: "JSONEachRow",
                    }),
                  ])
                  const trendRows = await trendResult.json<TrendRow>()
                  const fromRows = await fromResult.json<TokensAtRow>()
                  const toRows = await toResult.json<TokensAtRow>()
                  const trend = new Map<string, MemoryActivityWriteBucket[]>()
                  for (const row of trendRows) {
                    const buckets = trend.get(row.store_id) ?? []
                    buckets.push({ bucketStart: parseCHDate(row.bucket_start).toISOString(), writes: num(row.writes) })
                    trend.set(row.store_id, buckets)
                  }
                  const toTokenMap = (tokenRows: readonly TokensAtRow[]) =>
                    new Map(tokenRows.map((row) => [row.store_id, num(row.tokens)]))
                  return { trendByStore: trend, tokensFrom: toTokenMap(fromRows), tokensTo: toTokenMap(toRows) }
                })
                .pipe(
                  Effect.mapError((error) =>
                    toRepositoryError(error, "MemoryAnalyticsRepository.listStoresWithMetrics"),
                  ),
                )

        const items = rows.map((row): MemoryStoreMetricsItem => {
          const lastActivity = parseCHDate(row.last_activity_at)
          return {
            storeId: row.store_id,
            liveRecords: num(row.live_records),
            liveTokens: num(row.live_tokens),
            deadRecords: num(row.dead_records),
            writes: num(row.writes),
            reads: num(row.reads),
            searches: num(row.searches),
            zeroHitSearches: num(row.zero_hit_searches),
            updateEvents: num(row.update_events),
            recordsTouched: num(row.records_touched),
            sessionCount: num(row.session_count),
            userCount: num(row.user_count),
            lastActivityAt: lastActivity.getTime() > 0 ? lastActivity : null,
            netGrowthTokens: (tokensTo.get(row.store_id) ?? 0) - (tokensFrom.get(row.store_id) ?? 0),
            trend: trendByStore.get(row.store_id) ?? [],
          }
        })

        return { items, totalCount, hasMore, limit, offset }
      })

    return { listStoresWithMetrics }
  }),
)
