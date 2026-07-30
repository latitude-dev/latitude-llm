import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape } from "@domain/shared"
import type {
  CostAnalyticsScope,
  CostBreakdown,
  CostBreakdownDimension,
  CostBreakdownRow,
  CostBreakdownTotals,
  CostOverview,
  CostSeriesBucket,
  CostSeriesMetric,
  CostSeriesModelSlice,
  CostZeroCostPair,
  ModelUsageBucket,
  ModelUsageSeries,
  ModelUsageSlice,
} from "@domain/spans"
import {
  COST_BREAKDOWN_ROW_LIMIT,
  CostAnalyticsRepository,
  costSourceSchema,
  MODEL_USAGE_SERIES_LIMIT,
} from "@domain/spans"
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
const ZERO_COST_PAIR_LIMIT = 50

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

const COST_SOURCE_VALUES_SQL = `(${costSourceSchema.options.map((value) => `'${value}'`).join(", ")})`

// SQL mirror of `parseCostSource`: rows stored before the column read back empty,
// a non-zero cost still says which side it came from, and a zero with tokens among
// them cannot say whether it was free or unpriced — so it stays `unknown`.
const COST_SOURCE = `if(
  cost_source IN ${COST_SOURCE_VALUES_SQL},
  cost_source,
  if(
    cost_total_microcents > 0,
    if(cost_is_estimated = 1, 'estimated', 'provider_reported'),
    if(tokens_total > 0, 'unknown', 'no_tokens')
  )
)`

const BREAKDOWN_DIMENSION_SQL: Record<CostBreakdownDimension, string> = {
  model: "model",
  provider: "provider",
  operation: "operation",
  service: "service_name",
}

// One projection feeding both the per-value rows and the window totals, so a share
// can never be taken against a differently-filtered denominator.
const breakdownSource = (dimension: CostBreakdownDimension) => `SELECT
        ${BREAKDOWN_DIMENSION_SQL[dimension]} AS key,
        trace_id,
        tokens_total,
        cost_total_microcents,
        cost_input_microcents,
        cost_output_microcents,
        ${COST_SOURCE} AS cost_source
      FROM spans
      WHERE ${BILLABLE_FILTER}`

const BREAKDOWN_MEASURES = `sum(cost_total_microcents) AS total_microcents,
        sum(cost_input_microcents) AS input_microcents,
        sum(cost_output_microcents) AS output_microcents,
        count() AS calls,
        sum(tokens_total) AS tokens,
        sumIf(tokens_total, cost_source = 'unpriced') AS unpriced_tokens,
        countIf(cost_source = 'unpriced') AS unpriced_calls,
        sumIf(tokens_total, cost_source = 'unknown') AS unknown_tokens,
        countIf(cost_source = 'unknown') AS unknown_calls`

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
  unpriced_calls: string
  unknown_tokens: string
  unknown_calls: string
}

type TopSpendRow = {
  model: string
  provider: string
  cost_microcents: string
}

type ZeroCostPairRow = {
  provider: string
  model: string
  tokens: string
  calls: string
  cost_source: string
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

type BreakdownMeasureRow = {
  total_microcents: string
  input_microcents: string
  output_microcents: string
  calls: string
  tokens: string
  unpriced_tokens: string
  unpriced_calls: string
  unknown_tokens: string
  unknown_calls: string
}

type BreakdownRow = BreakdownMeasureRow & { key: string; traces_with_value: string }

type BreakdownTotalsRow = BreakdownMeasureRow & { traces_with_usage: string; distinct_values: string }

type ModelUsageMeasuresDraft = { cost: number; tokens: number }

type ModelUsageRow = {
  bucket_start: string
  model: string
  is_other: number
  cost_microcents: string
  tokens: string
}

const toBreakdownUsage = (row: BreakdownMeasureRow) => {
  const totalMicrocents = num(row.total_microcents)
  const inputMicrocents = num(row.input_microcents)
  const outputMicrocents = num(row.output_microcents)
  return {
    totalMicrocents,
    inputMicrocents,
    outputMicrocents,
    cacheAndOtherMicrocents: totalMicrocents - inputMicrocents - outputMicrocents,
    calls: num(row.calls),
    tokens: num(row.tokens),
    unpricedTokens: num(row.unpriced_tokens),
    unpricedCalls: num(row.unpriced_calls),
    unknownTokens: num(row.unknown_tokens),
    unknownCalls: num(row.unknown_calls),
  }
}

const toBreakdownRow = (row: BreakdownRow): CostBreakdownRow => {
  const usage = toBreakdownUsage(row)
  const tracesWithValue = num(row.traces_with_value)
  return {
    ...usage,
    key: normalizeCHString(row.key),
    tracesWithValue,
    // Divided by traces containing this value, never by every trace in the window:
    // a trace can hit several models, so the two denominators differ per row.
    avgPerTraceMicrocents: tracesWithValue > 0 ? usage.totalMicrocents / tracesWithValue : 0,
  }
}

const toBreakdownTotals = (row: BreakdownTotalsRow | undefined): CostBreakdownTotals => {
  const usage = toBreakdownUsage({
    total_microcents: row?.total_microcents ?? "0",
    input_microcents: row?.input_microcents ?? "0",
    output_microcents: row?.output_microcents ?? "0",
    calls: row?.calls ?? "0",
    tokens: row?.tokens ?? "0",
    unpriced_tokens: row?.unpriced_tokens ?? "0",
    unpriced_calls: row?.unpriced_calls ?? "0",
    unknown_tokens: row?.unknown_tokens ?? "0",
    unknown_calls: row?.unknown_calls ?? "0",
  })
  return {
    ...usage,
    tracesWithUsage: num(row?.traces_with_usage),
    avgPerCallMicrocents: usage.calls > 0 ? usage.totalMicrocents / usage.calls : 0,
    distinctValues: num(row?.distinct_values),
  }
}

const toZeroCostPair = (row: ZeroCostPairRow): CostZeroCostPair => ({
  provider: normalizeCHString(row.provider),
  model: normalizeCHString(row.model),
  tokens: num(row.tokens),
  calls: num(row.calls),
  source: row.cost_source === "unpriced" ? "unpriced" : "unknown",
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
              const [overviewResult, topSpendResult, zeroCostResult] = await Promise.all([
                client.query({
                  // `cost_source` is resolved in a subquery so the aggregates below
                  // can filter on it without nesting inside the alias.
                  query: `SELECT
                        sum(cost_total_microcents) AS total_microcents,
                        sumIf(cost_total_microcents, cost_source = 'provider_reported') AS verified_microcents,
                        sumIf(cost_total_microcents, cost_source = 'estimated') AS estimated_microcents,
                        uniqExact(trace_id) AS traces_with_usage,
                        sum(tokens_total) AS billable_tokens,
                        sumIf(tokens_total, cost_source = 'unpriced') AS unpriced_tokens,
                        countIf(cost_source = 'unpriced') AS unpriced_calls,
                        sumIf(tokens_total, cost_source = 'unknown') AS unknown_tokens,
                        countIf(cost_source = 'unknown') AS unknown_calls
                      FROM (
                        SELECT trace_id, tokens_total, cost_total_microcents, ${COST_SOURCE} AS cost_source
                        FROM spans
                        WHERE ${BILLABLE_FILTER}
                      )`,
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
                  // Both zero-cost buckets: what ingestion called unpriced, and
                  // pre-`cost_source` rows it can't speak for. The caller decides
                  // which are real gaps by re-reading the pricing registry.
                  query: `SELECT
                        provider,
                        model,
                        cost_source,
                        sum(tokens_total) AS tokens,
                        count() AS calls
                      FROM (
                        SELECT provider, model, tokens_total, ${COST_SOURCE} AS cost_source
                        FROM spans
                        WHERE ${BILLABLE_FILTER}
                      )
                      WHERE cost_source IN ('unpriced', 'unknown')
                      GROUP BY provider, model, cost_source
                      ORDER BY tokens DESC, model ASC
                      LIMIT {pairLimit:UInt16}`,
                  query_params: { ...params, pairLimit: ZERO_COST_PAIR_LIMIT },
                  format: "JSONEachRow",
                }),
              ])
              const overviewRows = await overviewResult.json<OverviewRow>()
              const topSpendRows = await topSpendResult.json<TopSpendRow>()
              const zeroCostRows = await zeroCostResult.json<ZeroCostPairRow>()
              return { overviewRows, topSpendRows, zeroCostRows }
            })
            .pipe(
              Effect.map(({ overviewRows, topSpendRows, zeroCostRows }): CostOverview => {
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
                    unpricedTokens: num(row?.unpriced_tokens),
                    unpricedCalls: num(row?.unpriced_calls),
                    unknownTokens: num(row?.unknown_tokens),
                    unknownCalls: num(row?.unknown_calls),
                    zeroCostPairs: zeroCostRows.map(toZeroCostPair),
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
                      HAVING cost_microcents > 0
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

      getCostBreakdown: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const source = breakdownSource(input.dimension)
          return yield* chSqlClient
            .query(async (client) => {
              const params = scopeParams(input)
              const [rowsResult, totalsResult] = await Promise.all([
                client.query({
                  query: `SELECT
                        key,
                        ${BREAKDOWN_MEASURES},
                        uniqExact(trace_id) AS traces_with_value
                      FROM (${source})
                      GROUP BY key
                      ORDER BY total_microcents DESC, key ASC
                      LIMIT {rowLimit:UInt16}`,
                  query_params: { ...params, rowLimit: COST_BREAKDOWN_ROW_LIMIT },
                  format: "JSONEachRow",
                }),
                client.query({
                  // Window-wide, so a truncated row list still divides by the real total.
                  query: `SELECT
                        ${BREAKDOWN_MEASURES},
                        uniqExact(trace_id) AS traces_with_usage,
                        uniqExact(key) AS distinct_values
                      FROM (${source})`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
              ])
              const rows = await rowsResult.json<BreakdownRow>()
              const totalsRows = await totalsResult.json<BreakdownTotalsRow>()
              return { rows, totalsRows }
            })
            .pipe(
              Effect.map(
                ({ rows, totalsRows }): CostBreakdown => ({
                  rows: rows.map(toBreakdownRow),
                  totals: toBreakdownTotals(totalsRows[0]),
                }),
              ),
            )
        }),

      getModelUsageSeries: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const params = { ...scopeParams(input), bucketSeconds: input.bucketSeconds }
              const [bucketsResult, distinctResult] = await Promise.all([
                client.query({
                  // Models outside the top ranks collapse into an `is_other` group rather
                  // than a label, so no real model name can collide with the bucket.
                  query: `SELECT
                        bucket_start,
                        is_other,
                        if(is_other, '', raw_model) AS model,
                        sum(cost_microcents) AS cost_microcents,
                        sum(tokens) AS tokens
                      FROM (
                        SELECT
                          ${BUCKET_START} AS bucket_start,
                          model AS raw_model,
                          model NOT IN (
                            SELECT model
                            FROM spans
                            WHERE ${BILLABLE_FILTER}
                            GROUP BY model
                            ORDER BY sum(cost_total_microcents) DESC, model ASC
                            LIMIT {modelLimit:UInt8}
                          ) AS is_other,
                          cost_total_microcents AS cost_microcents,
                          tokens_total AS tokens
                        FROM spans
                        WHERE ${BILLABLE_FILTER}
                      )
                      GROUP BY bucket_start, is_other, model
                      ORDER BY bucket_start ASC, cost_microcents DESC, model ASC`,
                  query_params: { ...params, modelLimit: MODEL_USAGE_SERIES_LIMIT },
                  format: "JSONEachRow",
                }),
                client.query({
                  query: `SELECT uniqExact(model) AS distinct_models
                      FROM spans
                      WHERE ${BILLABLE_FILTER}`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
              ])
              const rows = await bucketsResult.json<ModelUsageRow>()
              const distinctRows = await distinctResult.json<{ distinct_models: string }>()
              return { rows, distinctRows }
            })
            .pipe(
              Effect.map(({ rows, distinctRows }): ModelUsageSeries => {
                const byBucket = new Map<string, { byModel: ModelUsageSlice[]; other: ModelUsageMeasuresDraft }>()
                const spendByModel = new Map<string, number>()
                for (const row of rows) {
                  const bucket = byBucket.get(row.bucket_start) ?? { byModel: [], other: { cost: 0, tokens: 0 } }
                  const costMicrocents = num(row.cost_microcents)
                  const tokens = num(row.tokens)
                  if (row.is_other) {
                    bucket.other.cost += costMicrocents
                    bucket.other.tokens += tokens
                  } else {
                    const model = normalizeCHString(row.model)
                    bucket.byModel.push({ model, costMicrocents, tokens })
                    spendByModel.set(model, (spendByModel.get(model) ?? 0) + costMicrocents)
                  }
                  byBucket.set(row.bucket_start, bucket)
                }
                // Same ordering the SQL ranked by, so the legend matches the chosen set.
                const models = [...spendByModel.entries()]
                  .sort(([modelA, spendA], [modelB, spendB]) =>
                    spendB === spendA ? modelA.localeCompare(modelB) : spendB - spendA,
                  )
                  .map(([model]) => model)
                return {
                  buckets: [...byBucket.entries()].map(
                    ([bucketStart, bucket]): ModelUsageBucket => ({
                      bucketStart: parseCHDate(bucketStart),
                      byModel: bucket.byModel,
                      other: { costMicrocents: bucket.other.cost, tokens: bucket.other.tokens },
                    }),
                  ),
                  models,
                  otherModels: Math.max(0, num(distinctRows[0]?.distinct_models) - models.length),
                }
              }),
            )
        }),
    }
  }),
)
