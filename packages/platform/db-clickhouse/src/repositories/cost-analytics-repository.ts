import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape } from "@domain/shared"
import type {
  CostAnalyticsScope,
  CostOverview,
  CostSeriesBucket,
  CostSeriesMetric,
  CostSeriesModelSlice,
  CostUnpricedPair,
} from "@domain/spans"
import { CostAnalyticsRepository } from "@domain/spans"
import { formatCHDate, normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import { USAGE_OPERATIONS_SQL } from "../metric-sql/helpers.ts"

// Models beyond this many (by window spend) collapse into one slice so the
// stacked chart stays readable when a proxy reports hundreds of model strings.
const SERIES_MODEL_LIMIT = 8
const OTHER_MODELS_LABEL = "Other models"

// Distinct provider/model pairs listed for the unpriced-usage disclosure. Priced
// coverage is derived from these after classification, so the cap has to be
// generous enough that truncation can't hide a real pricing gap.
const UNPRICED_PAIR_LIMIT = 50

// The spans table's primary-key prefix, so range scans stay index-bound.
const SCOPE_FILTER = `organization_id = {organizationId:String}
  AND project_id = {projectId:String}
  AND start_time >= {from:DateTime64(9, 'UTC')}
  AND start_time < {to:DateTime64(9, 'UTC')}`

// Every cost figure is gated to billable operations — the same allowlist the
// traces/sessions rollups use, so wrapper spans never double-count spend. No
// dedup by span_id: same convention as the other span aggregates.
const BILLABLE_FILTER = `${SCOPE_FILTER}
  AND operation IN ${USAGE_OPERATIONS_SQL}`

// Tokens recorded but nothing charged for them.
const UNPRICED_PREDICATE = "cost_total_microcents = 0 AND tokens_total > 0"

const BUCKET_START = `toDateTime(
  intDiv(toUnixTimestamp(start_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
  'UTC'
)`

const scopeParams = (scope: CostAnalyticsScope) => ({
  organizationId: scope.organizationId as string,
  projectId: scope.projectId as string,
  from: formatCHDate(scope.from),
  to: formatCHDate(scope.to),
})

const num = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const SERIES_METRIC_AGGREGATE: Record<Exclude<CostSeriesMetric, "total">, string> = {
  average: "avg(trace_cost_microcents)",
  p95: "quantileTDigest(0.95)(trace_cost_microcents)",
}

type OverviewRow = {
  total_microcents: string
  verified_microcents: string
  estimated_microcents: string
  traces_with_usage: string
  billable_tokens: string
  unpriced_tokens: string
  unpriced_traces: string
}

type TopSpendRow = {
  model: string
  provider: string
  cost_microcents: string
}

type UnpricedPairRow = {
  provider: string
  model: string
  tokens: string
  calls: string
}

type ModelSeriesRow = {
  bucket_start: string
  model: string
  cost_microcents: string
}

type TraceSeriesRow = {
  bucket_start: string
  value_microcents: number
}

const toUnpricedPair = (row: UnpricedPairRow): CostUnpricedPair => ({
  provider: normalizeCHString(row.provider),
  model: normalizeCHString(row.model),
  tokens: num(row.tokens),
  calls: num(row.calls),
})

export const CostAnalyticsRepositoryLive = Layer.effect(
  CostAnalyticsRepository,
  Effect.gen(function* () {
    return {
      getCostOverview: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const params = scopeParams(input)
              const [overviewResult, topSpendResult, unpricedResult] = await Promise.all([
                client.query({
                  query: `SELECT
                        sum(cost_total_microcents) AS total_microcents,
                        sumIf(cost_total_microcents, cost_is_estimated = 0) AS verified_microcents,
                        sumIf(cost_total_microcents, cost_is_estimated = 1) AS estimated_microcents,
                        uniqExact(trace_id) AS traces_with_usage,
                        sum(tokens_total) AS billable_tokens,
                        sumIf(tokens_total, ${UNPRICED_PREDICATE}) AS unpriced_tokens,
                        uniqExactIf(trace_id, ${UNPRICED_PREDICATE}) AS unpriced_traces
                      FROM spans
                      WHERE ${BILLABLE_FILTER}`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
                client.query({
                  // Highest total spend, not highest unit price.
                  query: `SELECT model, provider, sum(cost_total_microcents) AS cost_microcents
                      FROM spans
                      WHERE ${BILLABLE_FILTER}
                      GROUP BY model, provider
                      HAVING cost_microcents > 0
                      ORDER BY cost_microcents DESC, model ASC
                      LIMIT 1`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
                client.query({
                  query: `SELECT
                        provider,
                        model,
                        sum(tokens_total) AS tokens,
                        count() AS calls
                      FROM spans
                      WHERE ${BILLABLE_FILTER} AND ${UNPRICED_PREDICATE}
                      GROUP BY provider, model
                      ORDER BY tokens DESC, model ASC
                      LIMIT {pairLimit:UInt16}`,
                  query_params: { ...params, pairLimit: UNPRICED_PAIR_LIMIT },
                  format: "JSONEachRow",
                }),
              ])
              const overviewRows = await overviewResult.json<OverviewRow>()
              const topSpendRows = await topSpendResult.json<TopSpendRow>()
              const unpricedRows = await unpricedResult.json<UnpricedPairRow>()
              return { overviewRows, topSpendRows, unpricedRows }
            })
            .pipe(
              Effect.map(({ overviewRows, topSpendRows, unpricedRows }): CostOverview => {
                const row = overviewRows[0]
                const totalMicrocents = num(row?.total_microcents)
                const tracesWithUsage = num(row?.traces_with_usage)
                const topSpend = topSpendRows[0]
                return {
                  totalMicrocents,
                  tracesWithUsage,
                  avgPerTraceMicrocents: tracesWithUsage > 0 ? totalMicrocents / tracesWithUsage : 0,
                  topSpendModel: topSpend
                    ? {
                        model: normalizeCHString(topSpend.model),
                        provider: normalizeCHString(topSpend.provider),
                        costMicrocents: num(topSpend.cost_microcents),
                      }
                    : null,
                  confidence: {
                    verifiedMicrocents: num(row?.verified_microcents),
                    estimatedMicrocents: num(row?.estimated_microcents),
                    billableTokens: num(row?.billable_tokens),
                    unpricedCandidateTokens: num(row?.unpriced_tokens),
                    unpricedCandidateTraces: num(row?.unpriced_traces),
                    unpricedCandidatePairs: unpricedRows.map(toUnpricedPair),
                  },
                }
              }),
            )
        }),

      getCostSeries: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const params = { ...scopeParams(input), bucketSeconds: input.bucketSeconds }
          const metric = input.metric
          if (metric === "total") {
            return yield* chSqlClient
              .query(async (client) => {
                const result = await client.query({
                  query: `SELECT bucket_start, model, sum(cost_microcents) AS cost_microcents
                      FROM (
                        SELECT
                          ${BUCKET_START} AS bucket_start,
                          if(
                            model IN (
                              SELECT model
                              FROM spans
                              WHERE ${BILLABLE_FILTER}
                              GROUP BY model
                              ORDER BY sum(cost_total_microcents) DESC, model ASC
                              LIMIT {modelLimit:UInt8}
                            ),
                            model,
                            {otherLabel:String}
                          ) AS model,
                          cost_total_microcents AS cost_microcents
                        FROM spans
                        WHERE ${BILLABLE_FILTER}
                      )
                      GROUP BY bucket_start, model
                      ORDER BY bucket_start ASC, cost_microcents DESC, model ASC`,
                  query_params: { ...params, modelLimit: SERIES_MODEL_LIMIT, otherLabel: OTHER_MODELS_LABEL },
                  format: "JSONEachRow",
                })
                return result.json<ModelSeriesRow>()
              })
              .pipe(
                Effect.map((rows): readonly CostSeriesBucket[] => {
                  const byBucket = new Map<string, { total: number; byModel: CostSeriesModelSlice[] }>()
                  for (const row of rows) {
                    const key = row.bucket_start
                    const bucket = byBucket.get(key) ?? { total: 0, byModel: [] }
                    const costMicrocents = num(row.cost_microcents)
                    bucket.total += costMicrocents
                    bucket.byModel.push({ model: normalizeCHString(row.model), costMicrocents })
                    byBucket.set(key, bucket)
                  }
                  return [...byBucket.entries()].map(([bucketStart, bucket]) => ({
                    bucketStart: parseCHDate(bucketStart),
                    valueMicrocents: bucket.total,
                    byModel: bucket.byModel,
                  }))
                }),
              )
          }
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                // Per-trace cost first: `average`/`p95` summarise the trace-cost
                // distribution, so a trace's spans must collapse to one value
                // before the bucket aggregate runs. A trace straddling a bucket
                // boundary contributes its slice to each bucket it touches.
                query: `SELECT bucket_start, ${SERIES_METRIC_AGGREGATE[metric]} AS value_microcents
                    FROM (
                      SELECT bucket_start, trace_id, sum(cost_microcents) AS trace_cost_microcents
                      FROM (
                        SELECT
                          ${BUCKET_START} AS bucket_start,
                          trace_id,
                          cost_total_microcents AS cost_microcents
                        FROM spans
                        WHERE ${BILLABLE_FILTER}
                      )
                      GROUP BY bucket_start, trace_id
                    )
                    GROUP BY bucket_start
                    ORDER BY bucket_start ASC`,
                query_params: params,
                format: "JSONEachRow",
              })
              return result.json<TraceSeriesRow>()
            })
            .pipe(
              Effect.map((rows): readonly CostSeriesBucket[] =>
                rows.map((row) => ({
                  bucketStart: parseCHDate(row.bucket_start),
                  valueMicrocents: num(row.value_microcents),
                  byModel: [],
                })),
              ),
            )
        }),
    }
  }),
)
