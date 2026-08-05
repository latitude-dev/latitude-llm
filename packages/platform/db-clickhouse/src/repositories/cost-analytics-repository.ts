import type { ClickHouseClient } from "@clickhouse/client"
import { ChSqlClient, type ChSqlClientShape } from "@domain/shared"
import type {
  CacheCadenceRow,
  CacheEconomics,
  CacheModelUsage,
  CacheUsageMeasures,
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
  SessionCostCell,
  SessionCostFactorsPair,
  SessionCostPeriod,
  TokenSide,
  WastedSpend,
} from "@domain/spans"
import {
  CACHE_CEILING_LIFETIME_SECONDS,
  CACHE_ECONOMICS_ROW_LIMIT,
  COST_BREAKDOWN_ROW_LIMIT,
  CostAnalyticsRepository,
  costSourceSchema,
  MODEL_USAGE_SERIES_LIMIT,
  WASTED_SPEND_REASON_LIMIT,
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

// Same prefix, opened back to the comparison window so both periods come off one scan.
const SCOPE_PREVIOUS_FILTER = `organization_id = {organizationId:String}
  AND project_id = {projectId:String}
  AND start_time >= {previousFrom:DateTime64(9, 'UTC')}
  AND start_time < {to:DateTime64(9, 'UTC')}`

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

// Both zero-cost buckets fold into one `unpriced` pair here: the table shows a
// single "this spend is understated" caveat, the same reading the breakdown
// table composes at display time.
const CACHE_MEASURES = `count() AS calls,
        sum(tokens_input) AS input_tokens,
        sum(tokens_cache_read) AS cache_read_tokens,
        sum(tokens_cache_create) AS cache_create_tokens,
        sum(cost_total_microcents) AS cost_microcents,
        countIf(cost_source IN ('unpriced', 'unknown')) AS unpriced_calls,
        sumIf(tokens_total, cost_source IN ('unpriced', 'unknown')) AS unpriced_tokens`

const CACHE_SOURCE = `SELECT
        model,
        provider,
        tokens_input,
        tokens_cache_read,
        tokens_cache_create,
        tokens_total,
        cost_total_microcents,
        ${COST_SOURCE} AS cost_source
      FROM spans
      WHERE ${BILLABLE_FILTER}`

// The agent a cache entry belongs to. `agent_name` is only set by SDKs that stamp it,
// so `service_name` carries the rest; both are the prompt-owning unit, which is what
// decides whether two calls could have shared a cached prefix.
//
// The fallback is the common path, not the edge case, and several unlabelled agents
// sharing one service look identical to one real agent. That collapse only ever shrinks
// gaps, so it overstates the ceiling — which can invent a "cache more" finding but never
// a `stopCaching`, since that needs the ceiling *below* break-even.
const CACHE_AGENT = `if(agent_name != '', agent_name, service_name)`

// Gap to the immediately preceding call to the same agent on the same model, over that
// agent's entire traffic — never within a session, which would score every single-turn
// workload as uncacheable. Refresh-on-hit TTL semantics need nothing extra: a chain of
// calls each inside the window keeps the entry warm, and one long gap breaks the chain,
// which is exactly what comparing each call's own gap to the TTL says.
//
// `lagInFrame` has no predecessor on a partition's first row and returns the epoch, so
// that call's gap is astronomically larger than any TTL — the automatic miss the formula
// calls for, without a special case.
const CACHE_CADENCE_SOURCE = `SELECT
        provider,
        model,
        call_tokens,
        dateDiff(
          'second',
          lagInFrame(start_time) OVER (
            PARTITION BY agent, provider, model
            ORDER BY start_time ASC
            ROWS BETWEEN 1 PRECEDING AND CURRENT ROW
          ),
          start_time
        ) AS gap_seconds
      FROM (
        SELECT
          provider,
          model,
          ${CACHE_AGENT} AS agent,
          start_time,
          tokens_input + tokens_cache_read + tokens_cache_create AS call_tokens
        FROM spans
        WHERE ${BILLABLE_FILTER}
      )`

// The session key the traces/sessions rollups aggregate on. Traffic that reported
// no session id keys on its trace id instead, so it becomes a single-trace
// pseudo-session rather than dropping out of every per-session figure.
const SESSION_KEY = `coalesce(nullIf(session_id, ''), toString(trace_id))`

// Splits one scan into the two adjacent windows. `is_current` is the bound the
// spans filter already narrowed to, so both periods read identical filters.
//
// The prompt side carries cache reads and writes because providers charge them on
// the input side, and `tokens_input` is the uncached remainder — the three are
// additive. Prompt cost is `total - output` rather than `cost_input` so the two
// sides always close on the total: a provider-reported total need not equal the
// sum of the sides it reports, and the price decomposition cannot absorb a gap.
const SESSION_FACTORS_SOURCE = `SELECT
        start_time,
        start_time >= {from:DateTime64(9, 'UTC')} AS is_current,
        ${SESSION_KEY} AS session_key,
        session_id,
        trace_id,
        provider,
        model,
        tokens_input + tokens_cache_read + tokens_cache_create AS prompt_tokens,
        tokens_output + tokens_reasoning AS output_tokens,
        cost_total_microcents - cost_output_microcents AS prompt_cost,
        cost_output_microcents AS output_cost,
        cost_total_microcents,
        ${COST_SOURCE} AS cost_source
      FROM spans
      WHERE ${SCOPE_PREVIOUS_FILTER}
        AND operation IN ${USAGE_OPERATIONS_SQL}`

// One row per trace, carrying its failure state alongside its billable spend.
//
// Deliberately *not* gated to billable operations: a trace fails on whichever span
// errored, and that is usually a tool or wrapper span carrying no usage. Cost and tokens
// are gated inside the aggregate instead, so the two questions read the same trace set
// without one narrowing the other. `billable_calls` lets the caller keep the same
// with-usage denominator every other per-trace figure on the page uses.
const WASTED_TRACE_SOURCE = `SELECT
        trace_id,
        max(status_code) = 2 AS has_error,
        argMinIf(error_type, start_time, status_code = 2) AS first_error_type,
        countIf(operation IN ${USAGE_OPERATIONS_SQL}) AS billable_calls,
        sumIf(cost_total_microcents, operation IN ${USAGE_OPERATIONS_SQL}) AS cost_microcents,
        sumIf(tokens_total, operation IN ${USAGE_OPERATIONS_SQL}) AS tokens,
        countIf(operation IN ${USAGE_OPERATIONS_SQL} AND ${COST_SOURCE} IN ('unpriced', 'unknown')) AS unpriced_calls
      FROM spans
      WHERE ${SCOPE_FILTER}
      GROUP BY trace_id
      HAVING billable_calls > 0`

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

type CacheMeasureRow = {
  calls: string
  input_tokens: string
  cache_read_tokens: string
  cache_create_tokens: string
  cost_microcents: string
  unpriced_calls: string
  unpriced_tokens: string
}

type CacheRow = CacheMeasureRow & { model: string; provider: string }

type CacheTotalsRow = CacheMeasureRow & { distinct_models: string }

type CacheCadenceQueryRow = {
  provider: string
  model: string
  cacheable_tokens: string
  calls: string
} & Record<string, string>

// Cumulative buckets, one per offered lifetime, generated from the domain constant: a
// lifetime the panel can offer is therefore always a bucket boundary, so its ceiling is
// exact rather than interpolated. `<=` makes each bucket contain the shorter ones.
const cadenceBucketAlias = (lifetimeSeconds: number) => `warm_${lifetimeSeconds}`
const cadenceCallsAlias = (lifetimeSeconds: number) => `warm_calls_${lifetimeSeconds}`

const CACHE_CADENCE_BUCKETS = CACHE_CEILING_LIFETIME_SECONDS.map(
  (lifetimeSeconds) =>
    `sumIf(call_tokens, gap_seconds <= ${lifetimeSeconds}) AS ${cadenceBucketAlias(lifetimeSeconds)},
        countIf(gap_seconds <= ${lifetimeSeconds}) AS ${cadenceCallsAlias(lifetimeSeconds)}`,
).join(",\n        ")

// `is_period` marks the WITH ROLLUP subtotal, which carries the window's own
// `uniqExact` rather than a sum of the buckets' — a session straddling a bucket
// edge belongs to one window but to two buckets, so the counts do not add up.
type SessionFactorsRow = {
  is_period: number
  is_everything: number
  is_current: number
  bucket_start: string
  sessions: string
  trace_keyed_sessions: string
  traces: string
  calls: string
  unpriced_calls: string
  cost_microcents: string
}

type SessionFactorsCellRow = {
  is_current: number
  provider: string
  model: string
  prompt_tokens: string
  prompt_cost: string
  output_tokens: string
  output_cost: string
}

const EMPTY_SESSION_PERIOD: SessionCostPeriod = {
  sessions: 0,
  traceKeyedSessions: 0,
  traces: 0,
  calls: 0,
  unpricedCalls: 0,
  cells: [],
}

const toSessionCells = (rows: readonly SessionFactorsCellRow[]): SessionCostCell[] =>
  rows.flatMap((row) => {
    const provider = normalizeCHString(row.provider)
    const model = normalizeCHString(row.model)
    return (
      [
        { side: "prompt" as const, tokens: num(row.prompt_tokens), costMicrocents: num(row.prompt_cost) },
        { side: "output" as const, tokens: num(row.output_tokens), costMicrocents: num(row.output_cost) },
      ] satisfies { side: TokenSide; tokens: number; costMicrocents: number }[]
    )
      .filter((cell) => cell.tokens > 0)
      .map((cell) => ({ provider, model, ...cell }))
  })

const toSessionPeriod = ({
  row,
  cells,
}: {
  row: SessionFactorsRow | undefined
  cells: readonly SessionFactorsCellRow[]
}): SessionCostPeriod =>
  row === undefined
    ? EMPTY_SESSION_PERIOD
    : {
        sessions: num(row.sessions),
        traceKeyedSessions: num(row.trace_keyed_sessions),
        traces: num(row.traces),
        calls: num(row.calls),
        unpricedCalls: num(row.unpriced_calls),
        cells: toSessionCells(cells),
      }

type WastedTotalsRow = {
  traces_with_usage: string
  total_microcents: string
  errored_traces: string
  errored_cost_microcents: string
  errored_unpriced_calls: string
  errored_tokens: string
  distinct_error_types: string
}

type WastedReasonRow = {
  error_type: string
  traces: string
  cost_microcents: string
}

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

const toCacheMeasures = (row: CacheMeasureRow | undefined): CacheUsageMeasures => ({
  calls: num(row?.calls),
  inputTokens: num(row?.input_tokens),
  cacheReadTokens: num(row?.cache_read_tokens),
  cacheCreateTokens: num(row?.cache_create_tokens),
  costMicrocents: num(row?.cost_microcents),
  unpricedCalls: num(row?.unpriced_calls),
  unpricedTokens: num(row?.unpriced_tokens),
})

const toCacheRow = (row: CacheRow): CacheModelUsage => ({
  ...toCacheMeasures(row),
  model: normalizeCHString(row.model),
  provider: normalizeCHString(row.provider),
})

const toCacheCadenceRow = (row: CacheCadenceQueryRow): CacheCadenceRow => {
  const warmTokensByLifetime: Record<number, number> = {}
  const warmCallsByLifetime: Record<number, number> = {}
  for (const lifetimeSeconds of CACHE_CEILING_LIFETIME_SECONDS) {
    warmTokensByLifetime[lifetimeSeconds] = num(row[cadenceBucketAlias(lifetimeSeconds)])
    warmCallsByLifetime[lifetimeSeconds] = num(row[cadenceCallsAlias(lifetimeSeconds)])
  }
  return {
    provider: normalizeCHString(row.provider),
    model: normalizeCHString(row.model),
    cacheableTokens: num(row.cacheable_tokens),
    calls: num(row.calls),
    warmTokensByLifetime,
    warmCallsByLifetime,
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

      getCacheEconomics: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const params = scopeParams(input)
              const [rowsResult, totalsResult, cadenceResult] = await Promise.all([
                client.query({
                  query: `SELECT model, provider, ${CACHE_MEASURES}
                      FROM (${CACHE_SOURCE})
                      GROUP BY model, provider
                      ORDER BY cost_microcents DESC, model ASC, provider ASC
                      LIMIT {rowLimit:UInt16}`,
                  query_params: { ...params, rowLimit: CACHE_ECONOMICS_ROW_LIMIT },
                  format: "JSONEachRow",
                }),
                client.query({
                  // Window-wide, so a truncated row list still says how much was left off.
                  query: `SELECT ${CACHE_MEASURES}, uniqExact((model, provider)) AS distinct_models
                      FROM (${CACHE_SOURCE})`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
                client.query({
                  // One pass over the window, no fan-out: every offered lifetime is a
                  // cumulative bucket, so the caller can price any of them from one row.
                  query: `SELECT
                        provider,
                        model,
                        sum(call_tokens) AS cacheable_tokens,
                        count() AS calls,
                        ${CACHE_CADENCE_BUCKETS}
                      FROM (${CACHE_CADENCE_SOURCE})
                      GROUP BY provider, model
                      ORDER BY provider ASC, model ASC`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
              ])
              const rows = await rowsResult.json<CacheRow>()
              const totalsRows = await totalsResult.json<CacheTotalsRow>()
              const cadenceRows = await cadenceResult.json<CacheCadenceQueryRow>()
              return { rows, totalsRows, cadenceRows }
            })
            .pipe(
              Effect.map(
                ({ rows, totalsRows, cadenceRows }): CacheEconomics => ({
                  rows: rows.map(toCacheRow),
                  cadence: cadenceRows.map(toCacheCadenceRow),
                  totals: {
                    ...toCacheMeasures(totalsRows[0]),
                    distinctModels: num(totalsRows[0]?.distinct_models),
                  },
                }),
              ),
            )
        }),

      getSessionCostFactors: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const params = {
                ...scopeParams(input),
                previousFrom: formatCHDate(input.previousFrom),
                bucketSeconds: input.bucketSeconds,
              }
              const [countsResult, cellsResult] = await Promise.all([
                client.query({
                  // One pass yields the sparkline buckets and the two window
                  // subtotals: `WITH ROLLUP` merges the `uniqExact` states at both
                  // levels, which summing bucket counts could not do. A session
                  // straddling the window boundary counts in both, the same
                  // convention the per-trace series uses for bucket edges.
                  query: `SELECT
                        GROUPING(bucket_start) AS is_period,
                        GROUPING(is_current) AS is_everything,
                        is_current,
                        bucket_start,
                        uniqExact(session_key) AS sessions,
                        uniqExactIf(session_key, session_id = '') AS trace_keyed_sessions,
                        uniqExact(trace_id) AS traces,
                        count() AS calls,
                        countIf(cost_source IN ('unpriced', 'unknown')) AS unpriced_calls,
                        sum(cost_total_microcents) AS cost_microcents
                      FROM (SELECT ${BUCKET_START} AS bucket_start, * FROM (${SESSION_FACTORS_SOURCE}))
                      GROUP BY is_current, bucket_start WITH ROLLUP
                      ORDER BY bucket_start ASC`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
                client.query({
                  // Never truncated: the mix and rate effects are shares of the
                  // whole, so a missing price list would silently land in the wrong row.
                  query: `SELECT
                        is_current,
                        provider,
                        model,
                        sum(prompt_tokens) AS prompt_tokens,
                        sum(prompt_cost) AS prompt_cost,
                        sum(output_tokens) AS output_tokens,
                        sum(output_cost) AS output_cost
                      FROM (${SESSION_FACTORS_SOURCE})
                      GROUP BY is_current, provider, model
                      HAVING prompt_tokens + output_tokens > 0`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
              ])
              const countRows = await countsResult.json<SessionFactorsRow>()
              const cellRows = await cellsResult.json<SessionFactorsCellRow>()
              return { countRows, cellRows }
            })
            .pipe(
              Effect.map(({ countRows, cellRows }): SessionCostFactorsPair => {
                // The grand-total row rolls `is_current` up to a default 0, which
                // collides with the previous window's own subtotal; drop it.
                const scoped = countRows.filter((row) => !Number(row.is_everything))
                const periodOf = (isCurrent: boolean) =>
                  toSessionPeriod({
                    row: scoped.find((row) => Number(row.is_period) === 1 && Boolean(row.is_current) === isCurrent),
                    cells: cellRows.filter((row) => Boolean(row.is_current) === isCurrent),
                  })
                return {
                  previous: periodOf(false),
                  current: periodOf(true),
                  buckets: scoped
                    .filter((row) => Number(row.is_period) === 0)
                    .map((row) => ({
                      bucketStart: parseCHDate(row.bucket_start),
                      sessions: num(row.sessions),
                      costMicrocents: num(row.cost_microcents),
                    })),
                }
              }),
            )
        }),

      getWastedSpend: (input) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const params = scopeParams(input)
              const [totalsResult, reasonsResult] = await Promise.all([
                client.query({
                  query: `SELECT
                        count() AS traces_with_usage,
                        sum(cost_microcents) AS total_microcents,
                        countIf(has_error) AS errored_traces,
                        sumIf(cost_microcents, has_error) AS errored_cost_microcents,
                        sumIf(unpriced_calls, has_error) AS errored_unpriced_calls,
                        sumIf(tokens, has_error) AS errored_tokens,
                        uniqExactIf(first_error_type, has_error) AS distinct_error_types
                      FROM (${WASTED_TRACE_SOURCE})`,
                  query_params: params,
                  format: "JSONEachRow",
                }),
                client.query({
                  // Ranked by spend, not by trace count: the panel's claim is about money.
                  query: `SELECT
                        first_error_type AS error_type,
                        count() AS traces,
                        sum(cost_microcents) AS cost_microcents
                      FROM (${WASTED_TRACE_SOURCE})
                      WHERE has_error
                      GROUP BY error_type
                      ORDER BY cost_microcents DESC, traces DESC, error_type ASC
                      LIMIT {reasonLimit:UInt16}`,
                  query_params: { ...params, reasonLimit: WASTED_SPEND_REASON_LIMIT },
                  format: "JSONEachRow",
                }),
              ])
              const totalsRows = await totalsResult.json<WastedTotalsRow>()
              const reasonRows = await reasonsResult.json<WastedReasonRow>()
              return { totalsRows, reasonRows }
            })
            .pipe(
              Effect.map(({ totalsRows, reasonRows }): WastedSpend => {
                const row = totalsRows[0]
                return {
                  erroredTraces: num(row?.errored_traces),
                  erroredCostMicrocents: num(row?.errored_cost_microcents),
                  tracesWithUsage: num(row?.traces_with_usage),
                  totalMicrocents: num(row?.total_microcents),
                  erroredUnpricedCalls: num(row?.errored_unpriced_calls),
                  erroredTokens: num(row?.errored_tokens),
                  reasons: reasonRows.map((reason) => ({
                    errorType: normalizeCHString(reason.error_type),
                    traces: num(reason.traces),
                    costMicrocents: num(reason.cost_microcents),
                  })),
                  distinctErrorTypes: num(row?.distinct_error_types),
                }
              }),
            )
        }),
    }
  }),
)
