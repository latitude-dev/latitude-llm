import type { ClickHouseClient } from "@clickhouse/client"
import {
  type MatchingEntity,
  type MetricSeriesBucketInput,
  MetricSeriesReader,
  type MetricSeriesReaderShape,
  type MetricSeriesWindowInput,
} from "@domain/monitors"
import { ChSqlClient, type ChSqlClientShape, toRepositoryError } from "@domain/shared"
import { normalizeCHString } from "@repo/utils"
import { Effect, Layer } from "effect"
import { anchorColumn } from "../metric-sql/helpers.ts"
import { streamFor } from "../metric-sql/index.ts"

/**
 * Most entities a single match check itemises. Alerting still fires past the cap;
 * the entities beyond it just go unrecorded and may alert again next window.
 */
const MATCH_ENTITY_LIMIT = 1000

// Monitors evaluate on the activity axis: a run enters the window when its latest span
// ended, not when it started, so a run longer than the window can still alert. Only this
// reader anchors that way; analytics and experiments stay start-anchored.
const toSqlInput = (input: MetricSeriesWindowInput) => ({
  organizationId: input.organizationId,
  projectId: input.projectId,
  filterSet: input.target.filterSet,
  query: input.target.query,
  metric: input.target.metric,
  from: input.from,
  to: input.to,
  windowAnchor: "end" as const,
})

/** ClickHouse `DateTime64` renders as `YYYY-MM-DD hh:mm:ss.fff`, which `Date` only parses once made ISO. */
const parseChDate = (value: string | null | undefined): Date | null => {
  if (!value) return null
  const parsed = new Date(value.includes(" ") ? `${value.replace(" ", "T")}Z` : value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

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
  matchingEntities: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const descriptor = streamFor(input.target.stream)
      const entityIdExpr = descriptor.entityIdExpr
      if (entityIdExpr === undefined) {
        return yield* Effect.fail(
          toRepositoryError(
            new Error(`Stream '${input.target.stream}' has no entity grain`),
            "MetricSeriesReader.matchingEntities",
          ),
        )
      }
      const inner = yield* descriptor.buildInner(toSqlInput(input))
      const startColumn = descriptor.timeColumns.start
      const rows = yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            // Group by the entity grain: the traces grain folds a session's traces
            // into one entity, so several inner rows can share an id.
            query: `SELECT ${entityIdExpr} AS entity_id, toString(min(${startColumn})) AS started_at
                    FROM (${inner.sql})
                    GROUP BY entity_id
                    ORDER BY min(${startColumn}) ASC
                    LIMIT ${MATCH_ENTITY_LIMIT}`,
            query_params: inner.params,
            ...(inner.clickhouseSettings ? { clickhouse_settings: inner.clickhouseSettings } : {}),
            format: "JSONEachRow",
          })
          return result.json<{ entity_id: string; started_at: string | null }>()
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "MetricSeriesReader.matchingEntities")))
      if (rows.length === MATCH_ENTITY_LIMIT) {
        yield* Effect.annotateCurrentSpan("monitors.matchingEntitiesTruncated", true)
      }
      return rows.flatMap((row): MatchingEntity[] => {
        const id = normalizeCHString(row.entity_id)
        const startTime = parseChDate(row.started_at)
        return id === "" || startTime === null ? [] : [{ id, startTime }]
      })
    }),
  firstEventAt: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const descriptor = streamFor(input.target.stream)
      const inner = yield* descriptor.buildInner(toSqlInput(input))
      // Deliberately the start axis while the window filters on the end axis: an
      // incident points at when the offending run began, not at when it alerted.
      const startColumn = descriptor.timeColumns.start
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            // `count()` guards the empty case — `min()` over zero rows returns the
            // epoch, not NULL, so we'd otherwise report a bogus 1970 first event.
            query: `SELECT toString(min(${startColumn})) AS first_at, count() AS matches FROM (${inner.sql})`,
            query_params: inner.params,
            ...(inner.clickhouseSettings ? { clickhouse_settings: inner.clickhouseSettings } : {}),
            format: "JSONEachRow",
          })
          return result.json<{ first_at: string | null; matches: string }>()
        })
        .pipe(
          Effect.map((rows) => {
            const row = rows[0]
            if (!row || Number(row.matches) === 0) return null
            return parseChDate(row.first_at)
          }),
          Effect.mapError((error) => toRepositoryError(error, "MetricSeriesReader.firstEventAt")),
        )
    }),
  lastEventAt: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      const descriptor = streamFor(input.target.stream)
      const inner = yield* descriptor.buildInner(toSqlInput(input))
      const endColumn = anchorColumn(descriptor.timeColumns, "end")
      return yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            // `count()` guards the empty case — `max()` over zero rows returns the
            // epoch, not NULL, so we'd otherwise report a bogus 1970 last event.
            query: `SELECT toString(max(${endColumn})) AS last_at, count() AS matches FROM (${inner.sql})`,
            query_params: inner.params,
            ...(inner.clickhouseSettings ? { clickhouse_settings: inner.clickhouseSettings } : {}),
            format: "JSONEachRow",
          })
          return result.json<{ last_at: string | null; matches: string }>()
        })
        .pipe(
          Effect.map((rows) => {
            const row = rows[0]
            if (!row || Number(row.matches) === 0) return null
            return parseChDate(row.last_at)
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
      // Bucket each match by how far its activity sits before `to`, in `bucketNs`
      // (= bucketMs) steps — index 0 is the bucket ending at `to`. Must be the same
      // column the window filters on, or in-window rows land on out-of-range indexes
      // and the densify loop below drops them. ClickHouse only returns non-empty
      // buckets, so we densify to `bucketCount` zero-filled entries in code.
      const bucketColumn = anchorColumn(descriptor.timeColumns, "end")
      const rows = yield* chSqlClient
        .query(async (client) => {
          const result = await client.query({
            query: `SELECT
                      intDiv(
                        reinterpretAsInt64(toDateTime64({windowTo:String}, 9, 'UTC')) - reinterpretAsInt64(${bucketColumn}),
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
