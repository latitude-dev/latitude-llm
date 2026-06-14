import type { ClickHouseClient } from "@clickhouse/client"
import {
  type MetricSeriesBucketInput,
  MetricSeriesReader,
  type MetricSeriesReaderShape,
  type MetricSeriesWindowInput,
} from "@domain/monitors"
import {
  ChSqlClient,
  type ChSqlClientShape,
  type MonitorMetric,
  type RepositoryError,
  toRepositoryError,
} from "@domain/shared"
import { parseSearchQuery } from "@domain/spans"
import { Effect, Layer } from "effect"
import { isActiveSearch, planSearch } from "./search-plan.ts"
import { buildTraceFilterClauses, LIST_SELECT, resolvePercentileFilters } from "./trace-repository.ts"

/** ClickHouse `DateTime64` params take a space-separated, zone-naive string (UTC). */
const toClickHouseDateTime64 = (value: Date): string => value.toISOString().replace("T", " ").replace("Z", "")

/**
 * Per-stream column expressions a metric aggregates over. The inner subquery
 * exposes these as output columns (for `traces`, the `LIST_SELECT` aliases);
 * `isError` is a boolean expression, not a column. Spans/sessions add their own.
 */
interface MetricColumns {
  readonly duration: string
  readonly cost: string
  readonly tokens: string
  readonly isError: string
}

const TRACE_METRIC_COLUMNS: MetricColumns = {
  duration: "duration_ns",
  cost: "cost_total_microcents",
  tokens: "tokens_total",
  isError: "error_count > 0",
}

/**
 * SQL aggregate applied over the per-entity grouped subquery. `count` makes this
 * reader an exact drop-in for the saved-search match reader it supersedes.
 * Ratios/averages guard the empty group (`count() = 0`) so a metric over an empty
 * window/bucket reads `0`, not `nan` — densified empty buckets then stay numeric.
 */
const metricAggregate = (metric: MonitorMetric, columns: MetricColumns): string => {
  switch (metric.kind) {
    case "count":
      return "count()"
    case "errorRate":
      return `if(count() = 0, 0, countIf(${columns.isError}) / count())`
    case "sum":
      return `sum(${columns[metric.field]})`
    case "avg":
      return `if(count() = 0, 0, avg(${columns[metric.field]}))`
    case "p95":
      return `if(count() = 0, 0, quantile(0.95)(${columns[metric.field]}))`
  }
}

/**
 * The grouped per-trace subquery the metric queries wrap, for the `traces`
 * stream. The window is a `HAVING` on the aggregated `start_time` (same as the
 * trace list/count), combined with the target's filters + semantic query.
 * Lifted from the saved-search match reader; spans/sessions add sibling branches.
 */
const buildInnerQuery = (
  input: MetricSeriesWindowInput,
): Effect.Effect<
  {
    readonly sql: string
    readonly params: Record<string, unknown>
    readonly clickhouseSettings?: Record<string, string | number | boolean>
  },
  RepositoryError,
  ChSqlClient
> =>
  Effect.gen(function* () {
    if (input.target.stream !== "traces") {
      return yield* Effect.die(`MetricSeriesReader: stream '${input.target.stream}' not implemented yet`)
    }
    const filterSet = yield* resolvePercentileFilters(input.organizationId, input.projectId, input.target.filterSet)
    const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filterSet)
    const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

    const parsed = input.target.query ? parseSearchQuery(input.target.query) : undefined
    let searchCondition = ""
    let searchParams: Record<string, unknown> = {}
    let clickhouseSettings: Record<string, string | number | boolean> | undefined
    if (parsed && isActiveSearch(parsed)) {
      const plan = yield* planSearch(parsed)
      searchCondition = `AND trace_id IN (SELECT trace_id FROM (${plan.subquery}))`
      searchParams = plan.params
      clickhouseSettings = plan.clickhouseSettings
    }

    const having = [
      "start_time >= toDateTime64({windowFrom:String}, 9, 'UTC')",
      "start_time < toDateTime64({windowTo:String}, 9, 'UTC')",
      ...havingClauses,
    ].join(" AND ")

    return {
      sql: `SELECT ${LIST_SELECT}
            FROM traces
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}
              ${extraWhere}
              ${searchCondition}
            GROUP BY organization_id, project_id, trace_id
            HAVING ${having}`,
      params: {
        organizationId: input.organizationId as string,
        projectId: input.projectId as string,
        windowFrom: toClickHouseDateTime64(input.from),
        windowTo: toClickHouseDateTime64(input.to),
        ...filterParams,
        ...searchParams,
      },
      ...(clickhouseSettings ? { clickhouseSettings } : {}),
    }
  })

const make = (): MetricSeriesReaderShape => ({
  valueInWindow: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const inner = yield* buildInnerQuery(input)
      const aggregate = metricAggregate(input.target.metric, TRACE_METRIC_COLUMNS)
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT ${aggregate} AS total FROM (${inner.sql})`,
            query_params: inner.params,
            ...(inner.clickhouseSettings ? { clickhouse_settings: inner.clickhouseSettings } : {}),
            format: "JSONEachRow",
          })
          return result.json<{ total: string }>()
        })
        .pipe(
          Effect.map((rows) => Number(rows[0]?.total ?? 0)),
          Effect.mapError((error) => toRepositoryError(error, "MetricSeriesReader.valueInWindow")),
        )
    }),
  firstEventAt: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const inner = yield* buildInnerQuery(input)
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            // `count()` guards the empty case — `min()` over zero rows returns the
            // epoch, not NULL, so we'd otherwise report a bogus 1970 first event.
            query: `SELECT toString(min(start_time)) AS first_at, count() AS matches FROM (${inner.sql})`,
            query_params: inner.params,
            ...(inner.clickhouseSettings ? { clickhouse_settings: inner.clickhouseSettings } : {}),
            format: "JSONEachRow",
          })
          return result.json<{ first_at: string | null; matches: string }>()
        })
        .pipe(
          Effect.map((rows) => {
            const row = rows[0]
            if (!row || Number(row.matches) === 0 || !row.first_at) return null
            const parsed = new Date(row.first_at.includes(" ") ? `${row.first_at.replace(" ", "T")}Z` : row.first_at)
            return Number.isNaN(parsed.getTime()) ? null : parsed
          }),
          Effect.mapError((error) => toRepositoryError(error, "MetricSeriesReader.firstEventAt")),
        )
    }),
  lastEventAt: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const inner = yield* buildInnerQuery(input)
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            // `count()` guards the empty case — `max()` over zero rows returns the
            // epoch, not NULL, so we'd otherwise report a bogus 1970 last event.
            query: `SELECT toString(max(start_time)) AS last_at, count() AS matches FROM (${inner.sql})`,
            query_params: inner.params,
            ...(inner.clickhouseSettings ? { clickhouse_settings: inner.clickhouseSettings } : {}),
            format: "JSONEachRow",
          })
          return result.json<{ last_at: string | null; matches: string }>()
        })
        .pipe(
          Effect.map((rows) => {
            const row = rows[0]
            if (!row || Number(row.matches) === 0 || !row.last_at) return null
            const parsed = new Date(row.last_at.includes(" ") ? `${row.last_at.replace(" ", "T")}Z` : row.last_at)
            return Number.isNaN(parsed.getTime()) ? null : parsed
          }),
          Effect.mapError((error) => toRepositoryError(error, "MetricSeriesReader.lastEventAt")),
        )
    }),
  seriesPerBucket: (input: MetricSeriesBucketInput) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const inner = yield* buildInnerQuery(input)
      const aggregate = metricAggregate(input.target.metric, TRACE_METRIC_COLUMNS)
      const bucketCount = Math.max(0, Math.floor((input.to.getTime() - input.from.getTime()) / input.bucketMs))
      // Bucket each matching trace by how far its `start_time` sits before `to`,
      // in `bucketNs` (= bucketMs) steps — index 0 is the bucket ending at `to`.
      // ClickHouse only returns non-empty buckets, so we densify to `bucketCount`
      // zero-filled entries in code.
      const rows = yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT
                      intDiv(
                        reinterpretAsInt64(toDateTime64({windowTo:String}, 9, 'UTC')) - reinterpretAsInt64(start_time),
                        {bucketNs:Int64}
                      ) AS bucket_index,
                      ${aggregate} AS value
                    FROM (${inner.sql})
                    GROUP BY bucket_index`,
            query_params: { ...inner.params, bucketNs: input.bucketMs * 1_000_000 },
            ...(inner.clickhouseSettings ? { clickhouse_settings: inner.clickhouseSettings } : {}),
            format: "JSONEachRow",
          })
          return result.json<{ bucket_index: string; value: string }>()
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "MetricSeriesReader.seriesPerBucket")))
      const values = new Array<number>(bucketCount).fill(0)
      for (const row of rows) {
        const index = Number(row.bucket_index)
        if (index >= 0 && index < bucketCount) values[index] = Number(row.value)
      }
      return values
    }),
})

export const MetricSeriesReaderLive = Layer.succeed(MetricSeriesReader, make())
