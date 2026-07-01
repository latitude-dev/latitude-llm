import type { ClickHouseClient } from "@clickhouse/client"
import {
  type AnalyticsMetric,
  type AnalyticsSeriesPoint,
  type AnalyticsTimeBucket,
  ChSqlClient,
  type ChSqlClientShape,
  metricValueFromStored,
  toRepositoryError,
} from "@domain/shared"
import { AnalyticsQueryReader, type AnalyticsQueryReaderShape } from "@domain/spans"
import { Effect, Layer } from "effect"
import { type BreakdownExpr, streamFor } from "../metric-sql/index.ts"

/**
 * Convert a raw ClickHouse aggregate to the value we return. Only the physical
 * quantities are scaled to display units — `duration` → seconds, `cost` →
 * dollars (via the platform's canonical converter). Rates (`errorRate`,
 * `cacheHitRate`, `passRate`), the 0–1 score `value`, and counts/tokens stay raw:
 * this is a data API, so a fraction is more composable than a percent downstream.
 */
const toDisplayValue = (raw: number, metric: AnalyticsMetric): number =>
  "field" in metric && (metric.field === "duration" || metric.field === "cost")
    ? metricValueFromStored(raw, metric)
    : raw

const TIME_BUCKET_UNIT_SQL: Record<AnalyticsTimeBucket["unit"], string> = {
  hour: "HOUR",
  day: "DAY",
  week: "WEEK",
}

/** Bucket-start expression, formatted to a stable UTC ISO-8601 string in SQL. */
const bucketExpr = (bucket: AnalyticsTimeBucket, timeColumn: string): string =>
  `formatDateTime(toStartOfInterval(${timeColumn}, INTERVAL ${bucket.size} ${TIME_BUCKET_UNIT_SQL[bucket.unit]}), '%Y-%m-%dT%H:%i:%SZ', 'UTC')`

const make = (): AnalyticsQueryReaderShape => ({
  query: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const descriptor = streamFor(input.stream)

      let breakdown: BreakdownExpr | undefined
      if (input.breakdown !== undefined) {
        breakdown = descriptor.breakdowns[input.breakdown]
        if (!breakdown) {
          return yield* Effect.fail(
            toRepositoryError(
              new Error(`Unknown breakdown '${input.breakdown}' for stream '${input.stream}'`),
              "AnalyticsQueryReader.query",
            ),
          )
        }
      }

      const inner = yield* descriptor.buildInner({
        organizationId: input.organizationId,
        projectId: input.projectId,
        target: { stream: input.stream, filterSet: input.filterSet, query: input.query, metric: input.metric },
        from: input.from,
        to: input.to,
      })
      const aggregate = descriptor.aggregate(input.metric)

      const selectParts: string[] = []
      const groupParts: string[] = []
      let arrayJoin = ""
      if (breakdown) {
        if (breakdown.isArray) {
          arrayJoin = `ARRAY JOIN ${breakdown.expr} AS breakdown_key`
          selectParts.push("breakdown_key AS key")
        } else {
          selectParts.push(`${breakdown.expr} AS key`)
        }
        groupParts.push("key")
      }
      if (input.timeBucket) {
        selectParts.push(`${bucketExpr(input.timeBucket, descriptor.timeColumn)} AS bucket_start`)
        groupParts.push("bucket_start")
      }
      selectParts.push(`${aggregate} AS value`)

      // Time-bucketed results read chronologically; pure breakdowns rank by the
      // requested axis so a capped `limit` keeps the top-N.
      const orderBy = input.timeBucket
        ? `ORDER BY bucket_start ASC${breakdown ? ", key ASC" : ""}`
        : breakdown
          ? `ORDER BY ${input.orderBy.by === "key" ? "key" : "value"} ${input.orderBy.direction === "asc" ? "ASC" : "DESC"}`
          : ""
      const groupBy = groupParts.length > 0 ? `GROUP BY ${groupParts.join(", ")}` : ""

      const sql = `SELECT ${selectParts.join(", ")}
                   FROM (${inner.sql})
                   ${arrayJoin}
                   ${groupBy}
                   ${orderBy}
                   LIMIT ${input.limit}`

      const rows = yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: sql,
            query_params: inner.params,
            ...(inner.clickhouseSettings ? { clickhouse_settings: inner.clickhouseSettings } : {}),
            format: "JSONEachRow",
          })
          return result.json<{ key?: string; bucket_start?: string; value: string }>()
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "AnalyticsQueryReader.query")))

      return rows.map(
        (row): AnalyticsSeriesPoint => ({
          ...(row.key !== undefined ? { key: row.key } : {}),
          ...(row.bucket_start !== undefined ? { bucketStart: row.bucket_start } : {}),
          value: toDisplayValue(Number(row.value ?? 0), input.metric),
        }),
      )
    }),
})

export const AnalyticsQueryReaderLive = Layer.succeed(AnalyticsQueryReader, make())
