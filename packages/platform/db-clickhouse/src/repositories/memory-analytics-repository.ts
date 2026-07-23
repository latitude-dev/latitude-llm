import type { ClickHouseClient } from "@clickhouse/client"
import type {
  MemoryActivityBucket,
  MemoryAnalyticsOverview,
  MemoryAnalyticsRepositoryShape,
  MemoryStoreMetricsItem,
  MemoryStoreMetricsPage,
  MemoryStoreMetricsSortField,
  MemoryStoreTrendBucket,
  MemoryZeroHitQueryGroup,
} from "@domain/memories"
import { MemoryAnalyticsRepository } from "@domain/memories"
import {
  ChSqlClient,
  type ChSqlClientShape,
  type OrganizationId,
  type ProjectId,
  toRepositoryError,
} from "@domain/shared"
import { formatCHDate, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"

const ZERO_HIT_QUERY_CAP = 50
const STORE_METRICS_CAP = 200

// Fixed map — never interpolate sort input into ORDER BY. Values are output
// aliases of the store-metrics query.
const STORE_METRIC_SORT_EXPRS: Record<MemoryStoreMetricsSortField, string> = {
  lastUpdated: "last_updated_at",
  lastRead: "last_read_at",
  records: "record_count",
  tokens: "token_count",
  sessions: "session_count",
  users: "user_count",
  reads: "read_sessions",
  yield: "write_yield",
  netGrowth: "net_token_growth",
}

const num = (value: string | number | null | undefined): number => Number(value ?? 0)

// Deduped mutating version chain over ALL time (retried projections collapse to
// one row per (trace, span, store, record)). Consumers add their own filters.
const mutationsSubquery = (storeFilter: string) => `
  SELECT store_id, record_id, content_hash, change_kind, token_count, end_time
  FROM (
    SELECT store_id, record_id, content_hash, change_kind, token_count, end_time, trace_id, span_id, ingested_at
    FROM memory_events
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      ${storeFilter}
      AND change_kind IN ('add', 'update', 'remove')
    ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
    LIMIT 1 BY trace_id, span_id, store_id, record_id
  )
`

// Deduped read events over ALL time, one row per returned record.
const readsSubquery = (storeFilter: string) => `
  SELECT store_id, record_id, end_time AS read_time
  FROM (
    SELECT store_id, record_id, end_time, trace_id, span_id, ingested_at
    FROM memory_events
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      ${storeFilter}
      AND change_kind = 'read'
    ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
    LIMIT 1 BY trace_id, span_id, store_id, record_id
  )
`

// Per-version outcome flags: predecessor hash (no-op detection), whether a later
// mutation supersedes it (completed), and whether it was read while active
// (consumed). The ASOF join finds the first read at/after the version's write;
// it lands inside the version's active window iff it precedes the successor.
const versionOutcomeSubquery = (storeFilter: string) => `
  SELECT
    v.end_time                                                   AS end_time,
    (v.content_hash != '' AND v.content_hash = v.prev_hash)      AS is_noop,
    (v.rn < v.cnt)                                               AS has_successor,
    (r.read_time >= v.end_time AND r.read_time < v.next_end)     AS consumed
  FROM (
    SELECT
      store_id, record_id, end_time, content_hash,
      lagInFrame(content_hash, 1, '') OVER w                                              AS prev_hash,
      leadInFrame(end_time, 1, toDateTime64('2999-01-01 00:00:00', 6, 'UTC')) OVER w      AS next_end,
      count() OVER w                                                                      AS cnt,
      row_number() OVER w                                                                 AS rn
    FROM ( ${mutationsSubquery(storeFilter)} )
    WINDOW w AS (
      PARTITION BY store_id, record_id ORDER BY end_time ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    )
  ) AS v
  ASOF LEFT JOIN ( ${readsSubquery(storeFilter)} ) AS r
    ON v.store_id = r.store_id AND v.record_id = r.record_id AND v.end_time <= r.read_time
`

type OverviewLiveRow = {
  readonly live_records: string | number
  readonly live_tokens: string | number
  readonly never_read_live_tokens: string | number
}
type OverviewReadRow = {
  readonly read_sessions: string | number
  readonly retrieved_tokens: string | number
  readonly search_count: string | number
  readonly zero_hit_search_count: string | number
}
type OverviewVersionRow = {
  readonly content_writes: string | number
  readonly noop_writes: string | number
  readonly completed_versions: string | number
  readonly consumed_versions: string | number
}

type ActivityRow = {
  readonly bucket_start: string
  readonly adds: string | number
  readonly updates: string | number
  readonly removes: string | number
  readonly reads: string | number
}

type StoreMetricsRow = {
  readonly store_id: string
  readonly record_count: string | number
  readonly token_count: string | number
  readonly last_updated_at: string
  readonly session_count: string | number
  readonly user_count: string | number
  readonly last_read_at: string
  readonly read_sessions: string | number
  readonly content_writes: string | number
  readonly completed_versions: string | number
  readonly consumed_versions: string | number
  readonly net_token_growth: string | number
}

type StoreTrendRow = {
  readonly store_id: string
  readonly bucket_start: string
  readonly writes: string | number
  readonly reads: string | number
}

type ZeroHitRow = {
  readonly query_text: string
  readonly search_count: string | number
  readonly store_count: string | number
  readonly any_store_id: string
  readonly last_seen_at: string
}

const rangeParams = (organizationId: OrganizationId, projectId: ProjectId, from: Date, to: Date) => ({
  organizationId: organizationId as string,
  projectId: projectId as string,
  from: formatCHDate(from),
  to: formatCHDate(to),
})

const RANGE_FILTER = "AND end_time >= {from:DateTime64(6, 'UTC')} AND end_time < {to:DateTime64(6, 'UTC')}"

export const MemoryAnalyticsRepositoryLive = Layer.effect(
  MemoryAnalyticsRepository,
  Effect.gen(function* () {
    const getOverview: MemoryAnalyticsRepositoryShape["getOverview"] = ({ organizationId, projectId, storeId, range }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const storeFilter = storeId !== undefined ? "AND store_id = {storeId:String}" : ""
        const scopeParams = {
          organizationId: organizationId as string,
          projectId: projectId as string,
          ...(storeId !== undefined ? { storeId } : {}),
        }
        const withRange = { ...rangeParams(organizationId, projectId, range.from, range.to), ...scopeParams }

        return yield* chSqlClient
          .query(async (client) => {
            const [liveResult, readResult, versionResult] = await Promise.all([
              client.query({
                query: `SELECT
                          count()                              AS live_records,
                          sum(token_count)                     AS live_tokens,
                          sumIf(token_count, never_read)       AS never_read_live_tokens
                        FROM (
                          SELECT token_count,
                                 (store_id, record_id) NOT IN (
                                   SELECT store_id, record_id FROM memory_events
                                   WHERE organization_id = {organizationId:String}
                                     AND project_id = {projectId:String}
                                     ${storeFilter}
                                     AND change_kind = 'read'
                                 ) AS never_read
                          FROM (
                            SELECT store_id, record_id, token_count, change_kind, end_time
                            FROM memory_current
                            WHERE organization_id = {organizationId:String}
                              AND project_id = {projectId:String}
                              ${storeFilter}
                            ORDER BY store_id, record_id, end_time DESC
                            LIMIT 1 BY store_id, record_id
                          )
                          WHERE change_kind != 'remove'
                        )`,
                query_params: scopeParams,
                format: "JSONEachRow",
              }),
              client.query({
                query: `SELECT
                          uniqExactIf(session_id, session_id != '') AS read_sessions,
                          sum(token_count)                          AS retrieved_tokens,
                          uniqExact(span_id)                        AS search_count,
                          uniqExactIf(span_id, record_count = 0)    AS zero_hit_search_count
                        FROM (
                          SELECT session_id, token_count, span_id, record_count
                          FROM memory_events
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${storeFilter}
                            AND change_kind = 'read'
                            ${RANGE_FILTER}
                          ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
                          LIMIT 1 BY trace_id, span_id, store_id, record_id
                        )`,
                query_params: withRange,
                format: "JSONEachRow",
              }),
              client.query({
                query: `SELECT
                          countIf(NOT is_noop)                 AS content_writes,
                          countIf(is_noop)                     AS noop_writes,
                          countIf(has_successor)               AS completed_versions,
                          countIf(has_successor AND consumed)  AS consumed_versions
                        FROM ( ${versionOutcomeSubquery(storeFilter)} )
                        WHERE end_time >= {from:DateTime64(6, 'UTC')} AND end_time < {to:DateTime64(6, 'UTC')}`,
                query_params: withRange,
                format: "JSONEachRow",
              }),
            ])
            const live = (await liveResult.json<OverviewLiveRow>())[0]
            const read = (await readResult.json<OverviewReadRow>())[0]
            const version = (await versionResult.json<OverviewVersionRow>())[0]
            return { live, read, version }
          })
          .pipe(
            Effect.map(
              ({ live, read, version }): MemoryAnalyticsOverview => ({
                liveRecords: num(live?.live_records),
                liveTokens: num(live?.live_tokens),
                neverReadLiveTokens: num(live?.never_read_live_tokens),
                readSessions: num(read?.read_sessions),
                retrievedTokens: num(read?.retrieved_tokens),
                searchCount: num(read?.search_count),
                zeroHitSearchCount: num(read?.zero_hit_search_count),
                contentWrites: num(version?.content_writes),
                noopWrites: num(version?.noop_writes),
                completedVersions: num(version?.completed_versions),
                consumedVersions: num(version?.consumed_versions),
              }),
            ),
            Effect.mapError((error) => toRepositoryError(error, "MemoryAnalyticsRepository.getOverview")),
          )
      })

    const getActivityHistogram: MemoryAnalyticsRepositoryShape["getActivityHistogram"] = ({
      organizationId,
      projectId,
      storeId,
      range,
      bucketSeconds,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const storeFilter = storeId !== undefined ? "AND store_id = {storeId:String}" : ""
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        bucket_start,
                        countIf(change_kind = 'add')    AS adds,
                        countIf(change_kind = 'update')  AS updates,
                        countIf(change_kind = 'remove')  AS removes,
                        countIf(change_kind = 'read')    AS reads
                      FROM (
                        SELECT
                          change_kind,
                          toDateTime(
                            intDiv(toUnixTimestamp(end_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                            'UTC'
                          ) AS bucket_start
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${storeFilter}
                          AND change_kind IN ('add', 'update', 'remove', 'read')
                          ${RANGE_FILTER}
                        ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id, store_id, record_id
                      )
                      GROUP BY bucket_start
                      ORDER BY bucket_start ASC`,
              query_params: {
                ...rangeParams(organizationId, projectId, range.from, range.to),
                ...(storeId !== undefined ? { storeId } : {}),
                bucketSeconds,
              },
              format: "JSONEachRow",
            })
            return result.json<ActivityRow>()
          })
          .pipe(
            Effect.map((rows) =>
              rows.map(
                (row): MemoryActivityBucket => ({
                  bucketStart: parseCHDate(row.bucket_start),
                  adds: num(row.adds),
                  updates: num(row.updates),
                  removes: num(row.removes),
                  reads: num(row.reads),
                }),
              ),
            ),
            Effect.mapError((error) => toRepositoryError(error, "MemoryAnalyticsRepository.getActivityHistogram")),
          )
      })

    const listStoresWithMetrics: MemoryAnalyticsRepositoryShape["listStoresWithMetrics"] = ({
      organizationId,
      projectId,
      range,
      options,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const limit = Math.min(options?.limit ?? 50, STORE_METRICS_CAP)
        const offset = options?.offset ?? 0
        const sortExpr = STORE_METRIC_SORT_EXPRS[options?.sortBy ?? "lastUpdated"]
        const orderDir = options?.sortDirection === "asc" ? "ASC" : "DESC"
        const withRange = rangeParams(organizationId, projectId, range.from, range.to)

        return yield* chSqlClient
          .query(async (client) => {
            const [pageResult, countResult] = await Promise.all([
              client.query({
                query: buildStoreMetricsQuery(sortExpr, orderDir),
                query_params: { ...withRange, limit: limit + 1, offset },
                format: "JSONEachRow",
              }),
              client.query({
                query: `SELECT count() AS total FROM (
                          SELECT store_id FROM memory_current
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                          GROUP BY store_id
                        )`,
                query_params: { organizationId: organizationId as string, projectId: projectId as string },
                format: "JSONEachRow",
              }),
            ])
            const rows = await pageResult.json<StoreMetricsRow>()
            const total = num((await countResult.json<{ total: string | number }>())[0]?.total)
            return { rows, total }
          })
          .pipe(
            Effect.map(({ rows, total }): MemoryStoreMetricsPage => {
              const hasMore = rows.length > limit
              const pageRows = hasMore ? rows.slice(0, limit) : rows
              return {
                items: pageRows.map(toStoreMetricsItem),
                totalCount: total,
                hasMore,
                limit,
                offset,
              }
            }),
            Effect.mapError((error) => toRepositoryError(error, "MemoryAnalyticsRepository.listStoresWithMetrics")),
          )
      })

    const getStoreTrendBuckets: MemoryAnalyticsRepositoryShape["getStoreTrendBuckets"] = ({
      organizationId,
      projectId,
      storeIds,
      range,
      bucketSeconds,
    }) =>
      Effect.gen(function* () {
        if (storeIds.length === 0) return []
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        store_id,
                        bucket_start,
                        countIf(change_kind IN ('add', 'update', 'remove')) AS writes,
                        countIf(change_kind = 'read')                        AS reads
                      FROM (
                        SELECT
                          store_id,
                          change_kind,
                          toDateTime(
                            intDiv(toUnixTimestamp(end_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                            'UTC'
                          ) AS bucket_start
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND store_id IN {storeIds:Array(String)}
                          AND change_kind IN ('add', 'update', 'remove', 'read')
                          ${RANGE_FILTER}
                        ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id, store_id, record_id
                      )
                      GROUP BY store_id, bucket_start
                      ORDER BY store_id ASC, bucket_start ASC`,
              query_params: {
                ...rangeParams(organizationId, projectId, range.from, range.to),
                storeIds: [...storeIds],
                bucketSeconds,
              },
              format: "JSONEachRow",
            })
            return result.json<StoreTrendRow>()
          })
          .pipe(
            Effect.map((rows) =>
              rows.map(
                (row): MemoryStoreTrendBucket => ({
                  storeId: row.store_id,
                  bucketStart: parseCHDate(row.bucket_start),
                  writes: num(row.writes),
                  reads: num(row.reads),
                }),
              ),
            ),
            Effect.mapError((error) => toRepositoryError(error, "MemoryAnalyticsRepository.getStoreTrendBuckets")),
          )
      })

    const listZeroHitQueries: MemoryAnalyticsRepositoryShape["listZeroHitQueries"] = ({
      organizationId,
      projectId,
      storeId,
      range,
      limit,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const storeFilter = storeId !== undefined ? "AND store_id = {storeId:String}" : ""
        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                        query_text,
                        count()                AS search_count,
                        uniqExact(store_id)    AS store_count,
                        any(store_id)          AS any_store_id,
                        max(read_time)         AS last_seen_at
                      FROM (
                        SELECT query_text, store_id, span_id, end_time AS read_time
                        FROM memory_events
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${storeFilter}
                          AND change_kind = 'read'
                          AND record_count = 0
                          ${RANGE_FILTER}
                        ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
                        LIMIT 1 BY trace_id, span_id, store_id, record_id
                      )
                      GROUP BY query_text
                      ORDER BY search_count DESC, last_seen_at DESC
                      LIMIT {limit:UInt32}`,
              query_params: {
                ...rangeParams(organizationId, projectId, range.from, range.to),
                ...(storeId !== undefined ? { storeId } : {}),
                limit: limit ?? ZERO_HIT_QUERY_CAP,
              },
              format: "JSONEachRow",
            })
            return result.json<ZeroHitRow>()
          })
          .pipe(
            Effect.map((rows) =>
              rows.map(
                (row): MemoryZeroHitQueryGroup => ({
                  queryText: row.query_text,
                  searchCount: num(row.search_count),
                  storeCount: num(row.store_count),
                  anyStoreId: row.any_store_id,
                  lastSeenAt: parseCHDate(row.last_seen_at),
                }),
              ),
            ),
            Effect.mapError((error) => toRepositoryError(error, "MemoryAnalyticsRepository.listZeroHitQueries")),
          )
      })

    return {
      getOverview,
      getActivityHistogram,
      listStoresWithMetrics,
      getStoreTrendBuckets,
      listZeroHitQueries,
    }
  }),
)

const toStoreMetricsItem = (row: StoreMetricsRow): MemoryStoreMetricsItem => {
  const lastRead = parseCHDate(row.last_read_at)
  return {
    storeId: row.store_id,
    recordCount: num(row.record_count),
    tokenCount: num(row.token_count),
    lastUpdatedAt: parseCHDate(row.last_updated_at),
    sessionCount: num(row.session_count),
    userCount: num(row.user_count),
    lastReadAt: lastRead.getTime() > 0 ? lastRead : null,
    readSessions: num(row.read_sessions),
    contentWrites: num(row.content_writes),
    completedVersions: num(row.completed_versions),
    consumedVersions: num(row.consumed_versions),
    netTokenGrowth: num(row.net_token_growth),
  }
}

// The store list joins current-state footprint, all-time access stats, and
// range-scoped read/write/version-outcome/net-growth metrics per store. Version
// outcome is aggregated to the store here (the shared subquery emits per-version
// rows, tagged with store_id for grouping).
function buildStoreMetricsQuery(sortExpr: string, orderDir: string): string {
  return `
    SELECT
      c.store_id                                            AS store_id,
      c.record_count                                        AS record_count,
      c.token_count                                         AS token_count,
      c.last_updated_at                                     AS last_updated_at,
      e.session_count                                       AS session_count,
      e.user_count                                          AS user_count,
      e.last_read_at                                        AS last_read_at,
      r.read_sessions                                       AS read_sessions,
      v.content_writes                                      AS content_writes,
      v.completed_versions                                  AS completed_versions,
      v.consumed_versions                                   AS consumed_versions,
      (multiIf(v.completed_versions > 0, v.consumed_versions / v.completed_versions, 0)) AS write_yield,
      g.net_token_growth                                    AS net_token_growth
    FROM (
      SELECT store_id, count() AS record_count, sum(token_count) AS token_count, max(end_time) AS last_updated_at
      FROM (
        SELECT store_id, record_id, token_count, change_kind, end_time
        FROM memory_current
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
        ORDER BY store_id, record_id, end_time DESC
        LIMIT 1 BY store_id, record_id
      )
      WHERE change_kind != 'remove'
      GROUP BY store_id
    ) AS c
    LEFT JOIN (
      SELECT store_id,
             uniqExactIf(session_id, session_id != '')  AS session_count,
             uniqExactIf(user_id, user_id != '')        AS user_count,
             maxIf(end_time, change_kind = 'read')       AS last_read_at
      FROM memory_events
      WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
      GROUP BY store_id
    ) AS e ON c.store_id = e.store_id
    LEFT JOIN (
      SELECT store_id, uniqExactIf(session_id, session_id != '') AS read_sessions
      FROM (
        SELECT store_id, session_id
        FROM memory_events
        WHERE organization_id = {organizationId:String} AND project_id = {projectId:String}
          AND change_kind = 'read' ${RANGE_FILTER}
        ORDER BY trace_id, span_id, store_id, record_id, ingested_at DESC
        LIMIT 1 BY trace_id, span_id, store_id, record_id
      )
      GROUP BY store_id
    ) AS r ON c.store_id = r.store_id
    LEFT JOIN (
      SELECT store_id,
             countIf(NOT is_noop)                AS content_writes,
             countIf(has_successor)              AS completed_versions,
             countIf(has_successor AND consumed) AS consumed_versions
      FROM ( ${storeVersionOutcomeSubquery} )
      WHERE end_time >= {from:DateTime64(6, 'UTC')} AND end_time < {to:DateTime64(6, 'UTC')}
      GROUP BY store_id
    ) AS v ON c.store_id = v.store_id
    LEFT JOIN ( ${netGrowthSubquery} ) AS g ON c.store_id = g.store_id
    ORDER BY ${sortExpr} ${orderDir}, store_id ASC
    LIMIT {limit:UInt32} OFFSET {offset:UInt32}
  `
}

// Store-tagged variant of the version-outcome subquery (project-wide, no store filter).
const storeVersionOutcomeSubquery = `
  SELECT
    v.store_id                                                  AS store_id,
    v.end_time                                                  AS end_time,
    (v.content_hash != '' AND v.content_hash = v.prev_hash)     AS is_noop,
    (v.rn < v.cnt)                                              AS has_successor,
    (r.read_time >= v.end_time AND r.read_time < v.next_end)    AS consumed
  FROM (
    SELECT
      store_id, record_id, end_time, content_hash,
      lagInFrame(content_hash, 1, '') OVER w                                            AS prev_hash,
      leadInFrame(end_time, 1, toDateTime64('2999-01-01 00:00:00', 6, 'UTC')) OVER w    AS next_end,
      count() OVER w                                                                    AS cnt,
      row_number() OVER w                                                               AS rn
    FROM ( ${mutationsSubquery("")} )
    WINDOW w AS (
      PARTITION BY store_id, record_id ORDER BY end_time ASC
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    )
  ) AS v
  ASOF LEFT JOIN ( ${readsSubquery("")} ) AS r
    ON v.store_id = r.store_id AND v.record_id = r.record_id AND v.end_time <= r.read_time
`

// Per-store net token growth over the window: (tokens live at window end) −
// (tokens live at window start), summed per record. Uses argMax over the deduped
// mutation chain at each boundary; a `remove` contributes 0 tokens.
const netGrowthSubquery = `
  SELECT store_id, sum(end_tokens) - sum(start_tokens) AS net_token_growth
  FROM (
    SELECT
      store_id, record_id,
      argMaxIf(if(change_kind = 'remove', 0, token_count), end_time, end_time < {to:DateTime64(6, 'UTC')})    AS end_tokens,
      argMaxIf(if(change_kind = 'remove', 0, token_count), end_time, end_time < {from:DateTime64(6, 'UTC')})  AS start_tokens
    FROM ( ${mutationsSubquery("")} )
    GROUP BY store_id, record_id
  )
  GROUP BY store_id
`
