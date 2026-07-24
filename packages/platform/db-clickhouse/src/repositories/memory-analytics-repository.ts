import type { ClickHouseClient } from "@clickhouse/client"
import type {
  MemoryActivityBucket,
  MemoryActivityWriteBucket,
  MemoryAnalyticsRepositoryShape,
  MemoryAnalyticsScope,
  MemoryOverview,
  MemoryStoreMetricSortField,
  MemoryStoreMetricsItem,
  StoreInsights,
  StoreSizeBucket,
} from "@domain/memories"
import { MemoryAnalyticsRepository, STORE_SIZE_BUCKETS } from "@domain/memories"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { formatCHDate, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

const num = (value: string | number | null | undefined): number => Number(value ?? 0)

const SCOPE = `organization_id = {organizationId:String} AND project_id = {projectId:String}`
const WINDOW = `AND end_time >= {from:DateTime64(6, 'UTC')} AND end_time <= {to:DateTime64(6, 'UTC')}`
const STORE_FILTER = `AND store_id = {storeId:String}`

// Bounded below the client's connection-pool size (max_open_connections). Fanning every insight
// query out at once exhausts the pool; a single reset then abandons the batch's undrained response
// streams, poisoning pooled sockets and cascading into ECONNRESET storms.
const STORE_INSIGHTS_QUERY_CONCURRENCY = 4

// Retry dedup: collapse re-run duplicate rows to newest per (trace, span, store, record); only data-op kinds count as activity.
const dedupedWindow = (storeScoped: boolean) => `
  SELECT store_id, record_id, change_kind, content_hash, token_count, record_count, query_text, span_id, session_id, user_id, trace_id, end_time
  FROM memory_events
  WHERE ${SCOPE} ${WINDOW} ${storeScoped ? STORE_FILTER : ""} AND change_kind IN ('add', 'update', 'remove', 'read')
  ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
  LIMIT 1 BY trace_id, span_id, store_id, record_id
`

// Fixed map — never interpolate sort input into ORDER BY; `greatest(_, 1)` makes a zero denominator sort as 0 (no NULLs).
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

type OverviewCurrentRow = {
  readonly live_records: string | number
  readonly live_tokens: string | number
  readonly dead_tokens: string | number
}

type OverviewWindowRow = {
  readonly searches: string | number
  readonly zero_hit_searches: string | number
  readonly writes: string | number
  readonly records_retrieved: string | number
}

type ActivityRow = {
  readonly bucket_start: string
  readonly creations: string | number
  readonly updates: string | number
  readonly deletions: string | number
  readonly records_retrieved: string | number
}

type MostReadRow = { readonly record_id: string; readonly reads: string | number }
type ColdRow = {
  readonly record_id: string
  readonly token_count: string | number
  readonly never_read: number | boolean
  readonly last_updated: string
  readonly last_read: string
}
type QueryCountRow = { readonly query_text: string; readonly searches: string | number }
type LargestRow = { readonly record_id: string; readonly token_count: string | number }
type SizeRow = Record<string, string | number>
type TokenHistoryRow = { readonly bucket_start: string; readonly tokens: string | number }
type WriteHealthRow = {
  readonly record_id: string
  readonly writes: string | number
  readonly last_write: string
  readonly no_ops: string | number
}
type RevertedRow = { readonly record_id: string }
type ThrashRow = { readonly thrash: string | number }
type NoOpRow = { readonly noop: string | number }
type DuplicatesRow = { readonly groups: string | number; readonly records: string | number }

// countIf per shared size bucket, aliased b0..bN so the mapper can index by position.
const sizeDistributionSelect = STORE_SIZE_BUCKETS.map((bucket, index) => {
  const condition =
    bucket.max === null
      ? `token_count >= ${bucket.min}`
      : `token_count >= ${bucket.min} AND token_count < ${bucket.max}`
  return `countIf(${condition}) AS b${index}`
}).join(", ")

// Latest non-removed record per (store, record) from `memory_current`, flagged `never_read` against all-time reads that returned a record.
const liveRecords = (storeScoped: boolean) => `
  SELECT store_id, record_id, content_hash, token_count, end_time,
         (store_id, record_id) NOT IN (
           SELECT store_id, record_id FROM memory_events
           WHERE ${SCOPE} ${storeScoped ? STORE_FILTER : ""} AND change_kind = 'read' AND record_count > 0
         ) AS never_read
  FROM (
    SELECT store_id, record_id, content_hash, token_count, change_kind, end_time
    FROM memory_current
    WHERE ${SCOPE} ${storeScoped ? STORE_FILTER : ""}
    ORDER BY store_id, record_id, end_time DESC
    LIMIT 1 BY store_id, record_id
  )
  WHERE change_kind != 'remove'
`

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
    const getMemoryOverview: MemoryAnalyticsRepositoryShape["getMemoryOverview"] = (scope) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const storeScoped = scope.storeId !== undefined
        const storeParams = scope.storeId !== undefined ? { storeId: scope.storeId } : {}
        return yield* chSqlClient
          .query(async (client) => {
            const [currentResult, windowResult] = await Promise.all([
              client.query({
                query: `SELECT count() AS live_records, sum(token_count) AS live_tokens, sumIf(token_count, never_read) AS dead_tokens
                        FROM ( ${liveRecords(storeScoped)} )`,
                query_params: { ...scopeParams(scope), ...storeParams },
                format: "JSONEachRow",
              }),
              client.query({
                query: `SELECT
                          uniqExactIf(span_id, change_kind = 'read')                      AS searches,
                          uniqExactIf(span_id, change_kind = 'read' AND record_count = 0)  AS zero_hit_searches,
                          countIf(change_kind IN ('add', 'update', 'remove'))             AS writes,
                          countIf(change_kind = 'read' AND record_count > 0)              AS records_retrieved
                        FROM ( ${dedupedWindow(storeScoped)} )`,
                query_params: { ...rangeParams(scope), ...storeParams },
                format: "JSONEachRow",
              }),
            ])
            const current = (await currentResult.json<OverviewCurrentRow>())[0]
            const activity = (await windowResult.json<OverviewWindowRow>())[0]
            return { current, activity }
          })
          .pipe(
            Effect.map(
              ({ current, activity }): MemoryOverview => ({
                liveRecords: num(current?.live_records),
                liveTokens: num(current?.live_tokens),
                deadTokens: num(current?.dead_tokens),
                searches: num(activity?.searches),
                zeroHitSearches: num(activity?.zero_hit_searches),
                writes: num(activity?.writes),
                recordsRetrieved: num(activity?.records_retrieved),
              }),
            ),
            Effect.mapError((error) => toRepositoryError(error, "MemoryAnalyticsRepository.getMemoryOverview")),
          )
      })

    const getMemoryActivityHistogram: MemoryAnalyticsRepositoryShape["getMemoryActivityHistogram"] = ({
      organizationId,
      projectId,
      from,
      to,
      bucketSeconds,
      storeId,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const scope = { organizationId, projectId, from, to }
        const storeScoped = storeId !== undefined
        const storeParams = storeId !== undefined ? { storeId } : {}
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        toDateTime(intDiv(toUnixTimestamp(end_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32}, 'UTC') AS bucket_start,
                        countIf(change_kind = 'add')                        AS creations,
                        countIf(change_kind = 'update')                     AS updates,
                        countIf(change_kind = 'remove')                     AS deletions,
                        countIf(change_kind = 'read' AND record_count > 0)  AS records_retrieved
                      FROM ( ${dedupedWindow(storeScoped)} )
                      GROUP BY bucket_start
                      ORDER BY bucket_start ASC`,
              query_params: { ...rangeParams(scope), bucketSeconds, ...storeParams },
              format: "JSONEachRow",
            })
            return result.json<ActivityRow>()
          })
          .pipe(
            Effect.map((rows) =>
              rows.map(
                (row): MemoryActivityBucket => ({
                  bucketStart: parseCHDate(row.bucket_start).toISOString(),
                  creations: num(row.creations),
                  updates: num(row.updates),
                  deletions: num(row.deletions),
                  recordsRetrieved: num(row.records_retrieved),
                }),
              ),
            ),
            Effect.mapError((error) =>
              toRepositoryError(error, "MemoryAnalyticsRepository.getMemoryActivityHistogram"),
            ),
          )
      })

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
                    FROM ( ${dedupedWindow(false)} )
                    GROUP BY store_id
                  ),
                  cs AS (
                    SELECT store_id, count() AS live_records, sum(token_count) AS live_tokens, countIf(never_read) AS dead_records
                    FROM ( ${liveRecords(false)} )
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
                query: `SELECT uniqExact(store_id) AS total FROM ( ${dedupedWindow(false)} )`,
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

        // Net growth + per-row trend are page-scoped (returned store ids only) so the two ledger boundary scans stay O(page).
        const { trendByStore, tokensFrom, tokensTo } =
          storeIds.length === 0
            ? {
                trendByStore: new Map<string, MemoryActivityWriteBucket[]>(),
                tokensFrom: new Map<string, number>(),
                tokensTo: new Map<string, number>(),
              }
            : yield* chSqlClient
                .query(async (client) => {
                  // Inner subquery so WHERE binds the change_kind/end_time columns, not the argMax alias (ILLEGAL_AGGREGATION) — like readManifestAt.
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
                                FROM ( ${dedupedWindow(false)} )
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

    const getStoreInsights: MemoryAnalyticsRepositoryShape["getStoreInsights"] = ({
      organizationId,
      projectId,
      from,
      to,
      storeId,
      listLimit,
      bucketSeconds,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const scope = { organizationId, projectId, from, to }
        const windowParams = { ...rangeParams(scope), storeId, listLimit }
        const currentParams = { ...scopeParams(scope), storeId }
        // Live-token footprint over time: per-event token delta (add:+tokens, update:±diff vs the
        // record's previous version, remove:−previous), bucketed then cumulatively summed. Absolute
        // only when the window starts at inception (the dashboard runs it all-time).
        const tokenHistoryQuery = `
          SELECT bucket_start,
                 sum(bucket_delta) OVER (ORDER BY bucket_start ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS tokens
          FROM (
            SELECT toDateTime(intDiv(toUnixTimestamp(end_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32}, 'UTC') AS bucket_start,
                   sum(multiIf(
                     change_kind = 'add', toInt64(token_count),
                     change_kind = 'remove', -toInt64(prev_token),
                     toInt64(token_count) - toInt64(prev_token)
                   )) AS bucket_delta
            FROM (
              SELECT change_kind, token_count, end_time,
                     lagInFrame(token_count) OVER (PARTITION BY record_id ORDER BY end_time) AS prev_token
              FROM ( ${dedupedWindow(true)} )
              WHERE change_kind IN ('add', 'update', 'remove')
            )
            GROUP BY bucket_start
          )
          ORDER BY bucket_start ASC`
        const queryRows = <T>(query: string, params: Record<string, unknown>) =>
          chSqlClient.query(async (client) => {
            const result = await client.query({ query, query_params: params, format: "JSONEachRow" })
            return result.json<T>()
          })
        const queryRow = <T>(query: string, params: Record<string, unknown>) =>
          queryRows<T>(query, params).pipe(Effect.map((rows) => rows[0]))

        return yield* Effect.all(
          [
            queryRows<MostReadRow>(
              `SELECT record_id, count() AS reads
               FROM ( ${dedupedWindow(true)} )
               WHERE change_kind = 'read' AND record_count > 0 AND record_id != ''
               GROUP BY record_id
               ORDER BY reads DESC, record_id ASC
               LIMIT {listLimit:UInt32}`,
              windowParams,
            ),
            queryRows<ColdRow>(
              `SELECT lr.record_id AS record_id, lr.token_count AS token_count, lr.never_read AS never_read,
                      lr.end_time AS last_updated, r.last_read AS last_read
               FROM ( ${liveRecords(true)} ) AS lr
               LEFT JOIN (
                 SELECT record_id, max(end_time) AS last_read
                 FROM memory_events
                 WHERE ${SCOPE} ${STORE_FILTER} AND change_kind = 'read' AND record_count > 0
                 GROUP BY record_id
               ) AS r ON lr.record_id = r.record_id
               ORDER BY greatest(r.last_read, lr.end_time) ASC, lr.record_id ASC
               LIMIT {listLimit:UInt32}`,
              { ...currentParams, listLimit },
            ),
            queryRows<QueryCountRow>(
              `SELECT query_text, uniqExact(span_id) AS searches
               FROM ( ${dedupedWindow(true)} )
               WHERE change_kind = 'read' AND query_text != ''
               GROUP BY query_text
               ORDER BY searches DESC, query_text ASC
               LIMIT {listLimit:UInt32}`,
              windowParams,
            ),
            queryRows<QueryCountRow>(
              `SELECT query_text, uniqExact(span_id) AS searches
               FROM ( ${dedupedWindow(true)} )
               WHERE change_kind = 'read' AND record_count = 0 AND query_text != ''
               GROUP BY query_text
               ORDER BY searches DESC, query_text ASC
               LIMIT {listLimit:UInt32}`,
              windowParams,
            ),
            queryRows<LargestRow>(
              `SELECT record_id, token_count
               FROM ( ${liveRecords(true)} )
               ORDER BY token_count DESC, record_id ASC
               LIMIT {listLimit:UInt32}`,
              { ...currentParams, listLimit },
            ),
            queryRow<SizeRow>(`SELECT ${sizeDistributionSelect} FROM ( ${liveRecords(true)} )`, currentParams),
            queryRows<TokenHistoryRow>(tokenHistoryQuery, { ...windowParams, bucketSeconds }),
            queryRows<WriteHealthRow>(
              `SELECT w.record_id AS record_id, w.writes AS writes, w.last_write AS last_write, coalesce(n.no_ops, 0) AS no_ops
               FROM (
                 SELECT record_id,
                        count()        AS writes,
                        max(end_time)  AS last_write
                 FROM ( ${dedupedWindow(true)} )
                 WHERE change_kind IN ('add', 'update', 'remove')
                 GROUP BY record_id
               ) AS w
               LEFT JOIN (
                 SELECT record_id,
                        countIf(change_kind = 'update' AND content_hash = prev_hash AND prev_hash != '') AS no_ops
                 FROM (
                   SELECT record_id, change_kind, content_hash,
                          lagInFrame(content_hash)
                            OVER (PARTITION BY record_id ORDER BY end_time) AS prev_hash
                   FROM ( ${dedupedWindow(true)} )
                   WHERE change_kind IN ('add', 'update')
                 )
                 GROUP BY record_id
               ) AS n ON w.record_id = n.record_id
               ORDER BY writes DESC, record_id ASC
               LIMIT {listLimit:UInt32}`,
              windowParams,
            ),
            // Store-wide thrash: writes beyond the first per (record, run) — redundant same-run rewrites.
            queryRow<ThrashRow>(
              `SELECT sum(writes_in_trace) - count() AS thrash
               FROM (
                 SELECT record_id, trace_id, count() AS writes_in_trace
                 FROM ( ${dedupedWindow(true)} )
                 WHERE change_kind IN ('add', 'update', 'remove')
                 GROUP BY record_id, trace_id
               )`,
              windowParams,
            ),
            // A content hash that returns to an earlier value: runs (consecutive-dedup length) exceed distinct hashes.
            queryRows<RevertedRow>(
              `SELECT record_id
               FROM (
                 SELECT record_id, content_hash,
                        content_hash != lagInFrame(content_hash)
                          OVER (PARTITION BY record_id ORDER BY end_time) AS changed
                 FROM ( ${dedupedWindow(true)} )
                 WHERE change_kind IN ('add', 'update') AND content_hash != ''
               )
               GROUP BY record_id
               HAVING sum(changed) > uniqExact(content_hash)`,
              windowParams,
            ),
            // Updates whose body is byte-identical to the record's previous version (wasted writes).
            queryRow<NoOpRow>(
              `SELECT countIf(change_kind = 'update' AND content_hash = prev_hash AND prev_hash != '') AS noop
               FROM (
                 SELECT change_kind, content_hash,
                        lagInFrame(content_hash)
                          OVER (PARTITION BY record_id ORDER BY end_time) AS prev_hash
                 FROM ( ${dedupedWindow(true)} )
                 WHERE change_kind IN ('add', 'update')
               )`,
              windowParams,
            ),
            queryRow<DuplicatesRow>(
              `SELECT count() AS groups, sum(cnt) AS records
               FROM (
                 SELECT content_hash, count() AS cnt
                 FROM ( ${liveRecords(true)} )
                 WHERE content_hash != ''
                 GROUP BY content_hash
                 HAVING cnt > 1
               )`,
              currentParams,
            ),
          ],
          { concurrency: STORE_INSIGHTS_QUERY_CONCURRENCY },
        ).pipe(
          Effect.map(
            ([
              mostRead,
              cold,
              topQueries,
              zeroHit,
              largest,
              size,
              tokenHistory,
              writeHealth,
              thrash,
              reverted,
              noOp,
              duplicates,
            ]): StoreInsights => {
              const mapQueries = (rows: readonly QueryCountRow[]) =>
                rows.map((row) => ({ queryText: row.query_text, searches: num(row.searches) }))
              const sizeDistribution: StoreSizeBucket[] = STORE_SIZE_BUCKETS.map((bucket, index) => ({
                label: bucket.label,
                count: size ? num(size[`b${index}`]) : 0,
              }))
              const revertedIds = new Set(reverted.map((row) => row.record_id))
              return {
                mostReadRecords: mostRead.map((row) => ({ recordId: row.record_id, reads: num(row.reads) })),
                coldRecords: cold.map((row) => {
                  const neverRead = Number(row.never_read) === 1
                  const lastRead = parseCHDate(row.last_read)
                  return {
                    recordId: row.record_id,
                    tokenCount: num(row.token_count),
                    neverRead,
                    lastReadAt: neverRead || lastRead.getTime() <= 0 ? null : lastRead.toISOString(),
                    lastUpdatedAt: parseCHDate(row.last_updated).toISOString(),
                  }
                }),
                topQueries: mapQueries(topQueries),
                zeroHitQueries: mapQueries(zeroHit),
                largestRecords: largest.map((row) => ({ recordId: row.record_id, tokenCount: num(row.token_count) })),
                sizeDistribution,
                writeHealth: writeHealth.map((row) => ({
                  recordId: row.record_id,
                  writes: num(row.writes),
                  lastWriteAt: parseCHDate(row.last_write).toISOString(),
                  noOps: num(row.no_ops),
                  reverted: revertedIds.has(row.record_id),
                })),
                thrashWrites: num(thrash?.thrash),
                noOpRewrites: num(noOp?.noop),
                duplicateGroups: num(duplicates?.groups),
                duplicateRecords: num(duplicates?.records),
                tokenHistory: tokenHistory.map((row) => ({
                  bucketStart: parseCHDate(row.bucket_start).toISOString(),
                  tokens: num(row.tokens),
                })),
              }
            },
          ),
          Effect.mapError((error) => toRepositoryError(error, "MemoryAnalyticsRepository.getStoreInsights")),
        )
      })

    return { getMemoryOverview, getMemoryActivityHistogram, listStoresWithMetrics, getStoreInsights }
  }),
)
