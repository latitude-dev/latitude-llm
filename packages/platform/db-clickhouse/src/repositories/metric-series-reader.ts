import type { ClickHouseClient } from "@clickhouse/client"
import {
  type MetricSeriesBucketInput,
  MetricSeriesReader,
  type MetricSeriesReaderShape,
  type MetricSeriesWindowInput,
} from "@domain/monitors"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { Effect, Layer } from "effect"
import { streamFor } from "../metric-sql/index.ts"

const toSqlInput = (input: MetricSeriesWindowInput) => ({
  organizationId: input.organizationId,
  projectId: input.projectId,
  filterSet: input.target.filterSet,
  query: input.target.query,
  metric: input.target.metric,
  from: input.from,
  to: input.to,
})

const make = (): MetricSeriesReaderShape => ({
  valueInWindow: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const descriptor = streamFor(input.target.stream)
      const inner = yield* descriptor.buildInner(toSqlInput(input))
      const aggregate = descriptor.aggregate(input.target.metric)
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
      const descriptor = streamFor(input.target.stream)
      const inner = yield* descriptor.buildInner(toSqlInput(input))
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
      const descriptor = streamFor(input.target.stream)
      const inner = yield* descriptor.buildInner(toSqlInput(input))
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
      const descriptor = streamFor(input.target.stream)
      const inner = yield* descriptor.buildInner(toSqlInput(input))
      const aggregate = descriptor.aggregate(input.target.metric)
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
