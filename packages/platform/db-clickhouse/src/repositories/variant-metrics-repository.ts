import type { ClickHouseClient } from "@clickhouse/client"
import {
  type ComputeVariantMetricsInput,
  EXPERIMENT_METRICS,
  type ExperimentMetricKey,
  type ExperimentSummaryCounts,
  METRIC_QUERY_CONCURRENCY,
  TOP_LIST_LIMIT,
  type TopListItem,
  type VariantMetrics,
  VariantMetricsReader,
  type VariantMetricsReaderShape,
  type VariantPopulation,
} from "@domain/experiments"
import {
  ChSqlClient,
  type ChSqlClientShape,
  type OrganizationId,
  type ProjectId,
  type RepositoryError,
  toRepositoryError,
} from "@domain/shared"
import { normalizeCHString } from "@repo/utils"
import { Effect, Layer } from "effect"
import { streamFor } from "../metric-sql/index.ts"
import type { InnerQuery } from "../metric-sql/types.ts"

const DURATION_NS_PER_SECOND = 1_000_000_000
const MICROCENTS_PER_DOLLAR = 100_000_000

/**
 * Per-query safety caps for the population-scoped metric queries. A query that blows past these
 * fails its own request (a retryable RepositoryError) instead of tripping the server-wide
 * OvercommitTracker and killing unrelated tenants' queries. The execution cap sits under the 30s
 * HTTP `request_timeout` so ClickHouse aborts the query and frees the shared socket before the
 * client abandons it. Search-plan settings (from a semantic query) still layer on top, but these
 * caps always win. Mirrors `BOUNDED_READ_SETTINGS` in the span repository.
 */
const BOUNDED_METRIC_SETTINGS = {
  max_execution_time: 5,
  max_memory_usage: "1000000000",
  output_format_parallel_formatting: 0,
} as const

const withMetricGuards = (
  inner: Record<string, string | number | boolean> | undefined,
): Record<string, string | number | boolean> => ({ ...inner, ...BOUNDED_METRIC_SETTINGS })

const num = (value: unknown): number => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const toSeconds = (ns: unknown): number => num(ns) / DURATION_NS_PER_SECOND
const toDollars = (microcents: unknown): number => num(microcents) / MICROCENTS_PER_DOLLAR
const ratio = (numerator: number, denominator: number): number | null =>
  denominator > 0 ? numerator / denominator : null

/** Build the population inner query (filters + window + best-effort search) for one variant. */
const populationInner = (input: {
  organizationId: OrganizationId
  projectId: ProjectId
  population: VariantPopulation
}) =>
  streamFor("sessions").buildInner({
    organizationId: input.organizationId,
    projectId: input.projectId,
    filterSet: input.population.filterSet,
    query: input.population.query,
    metric: { kind: "count" },
    from: new Date(input.population.range.fromIso),
    to: new Date(input.population.range.toIso),
  })

const runRows = <T>(
  chSqlClient: ChSqlClientShape<ClickHouseClient>,
  sql: string,
  params: Record<string, unknown>,
  settings: Record<string, string | number | boolean> | undefined,
) =>
  chSqlClient
    .query(async (client) => {
      const result = await client.query({
        query: sql,
        query_params: params,
        ...(settings ? { clickhouse_settings: settings } : {}),
        format: "JSONEachRow",
      })
      return result.json<T>()
    })
    .pipe(Effect.mapError((error) => toRepositoryError(error, "VariantMetricsReader")))

const runRow = <T>(
  chSqlClient: ChSqlClientShape<ClickHouseClient>,
  sql: string,
  params: Record<string, unknown>,
  settings: Record<string, string | number | boolean> | undefined,
) => runRows<T>(chSqlClient, sql, params, settings).pipe(Effect.map((rows) => rows[0]))

type Row = Record<string, unknown>

const emptyValues = (): Record<ExperimentMetricKey, number | null> =>
  Object.fromEntries(EXPERIMENT_METRICS.map((metric) => [metric.key, null])) as Record<
    ExperimentMetricKey,
    number | null
  >

const computeVariantMetrics = (
  chSqlClient: ChSqlClientShape<ClickHouseClient>,
  input: ComputeVariantMetricsInput,
): Effect.Effect<VariantMetrics, RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const inner = yield* populationInner({
      organizationId: input.organizationId,
      projectId: input.projectId,
      population: { filterSet: input.filterSet, query: input.query, range: input.range },
    }).pipe(Effect.mapError((error) => toRepositoryError(error, "VariantMetricsReader")))

    // Scope every child-entity query by the population as a server-side subquery — ClickHouse
    // computes the id set itself, so we never round-trip potentially millions of session ids
    // through Node. `session_id IN (SELECT session_id FROM (<inner>))` binds to the single projected
    // column; nesting the multi-column inner directly (`IN (<inner>)`) would silently bind to its
    // first column (organization_id) and match nothing. The window/filter/search params the inner
    // needs are merged in, and its clickhouse settings layer under the metric guards.
    const params: Record<string, unknown> = { ...inner.params }
    const settings = withMetricGuards(inner.clickhouseSettings)

    const scope = "organization_id = {organizationId:String} AND project_id = {projectId:String}"
    const inPop = `session_id IN (SELECT session_id FROM (${inner.sql}))`

    // The inner already IS the per-session rollup restricted to the population, so sessions + users
    // metrics read straight off it — no second scan of `sessions`. Callers wrap it in `(…)`.
    const sessionRollup = inner.sql

    const sessionsSql = `SELECT
        count() AS count,
        uniqExactIf(user_id, user_id != '') AS users,
        sum(cost_total_microcents) AS cost_total,
        quantileTDigest(0.5)(duration_ns) AS duration_median,
        if(count() = 0, 0, countIf(error_count > 0) / count()) AS error_rate,
        if((sum(tokens_input) + sum(tokens_cache_read) + sum(tokens_cache_create)) = 0, 0,
           sum(tokens_cache_read) / (sum(tokens_input) + sum(tokens_cache_read) + sum(tokens_cache_create))) AS cache_hit_rate,
        quantileTDigest(0.9)(duration_ns) AS duration_p90,
        quantileTDigest(0.95)(duration_ns) AS duration_p95,
        avg(cost_total_microcents) AS cost_avg,
        sum(tokens_total) AS tokens_total_sum,
        avg(tokens_total) AS tokens_avg,
        if(countIf(time_to_first_token_ns > 0) = 0, 0, quantileTDigestIf(0.5)(time_to_first_token_ns, time_to_first_token_ns > 0)) AS ttft_median,
        avg(span_count) AS spans_avg,
        avg(trace_count) AS traces_avg,
        sum(trace_count) AS traces_total
      FROM (${sessionRollup})`

    // Per-user rollup from the population's sessions (user_id lives on the session rollup).
    const usersSql = `SELECT
        count() AS distinct_users,
        avg(sessions) AS sessions_per_user,
        avg(traces) AS traces_per_user,
        avg(cost) AS cost_avg,
        quantileTDigest(0.5)(duration_ns) AS duration_median,
        quantileTDigest(0.9)(duration_ns) AS duration_p90,
        quantileTDigest(0.95)(duration_ns) AS duration_p95,
        avg(if(sessions = 0, 0, error_sessions / sessions)) AS error_session_rate
      FROM (
        SELECT user_id,
          count() AS sessions,
          sum(trace_count) AS traces,
          sum(cost_total_microcents) AS cost,
          sum(duration_ns) AS duration_ns,
          countIf(error_count > 0) AS error_sessions
        FROM (${sessionRollup})
        WHERE user_id != ''
        GROUP BY user_id
      )`

    const toolScope = `${scope} AND operation = 'execute_tool' AND tool_name != '' AND ${inPop}`
    const toolsSql = `SELECT
        count() AS calls,
        uniqExact(tool_name) AS distinct_tools,
        if(count() = 0, 0, countIf(status_code = 2) / count()) AS error_rate,
        if(count() = 0, 0, quantileTDigest(0.5)(duration_ns)) AS duration_p50,
        if(count() = 0, 0, quantileTDigest(0.9)(duration_ns)) AS duration_p90,
        if(count() = 0, 0, quantileTDigest(0.95)(duration_ns)) AS duration_p95,
        uniqExact(session_id) AS sessions_with_tools
      FROM spans
      WHERE ${toolScope}`
    const toolsTopSql = `SELECT tool_name AS key, count() AS value
      FROM spans WHERE ${toolScope}
      GROUP BY tool_name ORDER BY value DESC LIMIT ${TOP_LIST_LIMIT}`

    const signalScope = `${scope} AND signal_id != '' AND ${inPop}`
    const signalsSql = `SELECT
        count() AS occurrences,
        uniqExact(signal_id) AS distinct_signals,
        uniqExact(session_id) AS affected_sessions,
        uniqExact(trace_id) AS affected_traces
      FROM scores
      WHERE ${signalScope}`
    // Affected users + cost impact are session-scoped (scores carry no user id / session cost): read
    // them off the population's session rollup filtered to sessions that have a signal. The outer
    // rollup is already population-scoped, so the scores subquery drops the redundant population
    // filter and only needs "sessions that carry any signal in this project/window".
    const signalImpactSql = `SELECT
        uniqExactIf(user_id, user_id != '') AS affected_users,
        sum(cost_total_microcents) AS cost_impact
      FROM (${sessionRollup})
      WHERE session_id IN (SELECT DISTINCT session_id FROM scores WHERE ${scope} AND signal_id != '' AND session_id != '')`
    const signalsTopSql = `SELECT signal_id AS key, count() AS value
      FROM scores WHERE ${signalScope}
      GROUP BY signal_id ORDER BY value DESC LIMIT ${TOP_LIST_LIMIT}`

    const behaviourScope = `${scope} AND ${inPop}`
    const behavioursSql = `SELECT
        count() AS observations,
        uniqExactIf(assigned_cluster_id, assigned_cluster_id != '') AS distinct_clusters
      FROM taxonomy_observations FINAL
      WHERE ${behaviourScope}`
    const behavioursTopSql = `SELECT assigned_cluster_id AS key, count() AS value
      FROM taxonomy_observations FINAL WHERE ${behaviourScope} AND assigned_cluster_id != ''
      GROUP BY assigned_cluster_id ORDER BY value DESC LIMIT ${TOP_LIST_LIMIT}`
    // Semantic moments detected on the population's sessions (FINAL dedups the ReplacingMergeTree).
    const momentsSql = `SELECT count() AS moments
      FROM session_semantic_moments FINAL
      WHERE ${scope} AND ${inPop}`

    const [sessions, users, tools, toolsTop, signals, signalImpact, signalsTop, behaviours, behavioursTop, moments] =
      yield* Effect.all(
        [
          runRow<Row>(chSqlClient, sessionsSql, params, settings),
          runRow<Row>(chSqlClient, usersSql, params, settings),
          runRow<Row>(chSqlClient, toolsSql, params, settings),
          runRows<{ key: string; value: string }>(chSqlClient, toolsTopSql, params, settings),
          runRow<Row>(chSqlClient, signalsSql, params, settings),
          runRow<Row>(chSqlClient, signalImpactSql, params, settings),
          runRows<{ key: string; value: string }>(chSqlClient, signalsTopSql, params, settings),
          runRow<Row>(chSqlClient, behavioursSql, params, settings),
          runRows<{ key: string; value: string }>(chSqlClient, behavioursTopSql, params, settings),
          runRow<Row>(chSqlClient, momentsSql, params, settings),
        ],
        { concurrency: METRIC_QUERY_CONCURRENCY },
      )

    const sessionCount = num(sessions?.count)
    const usersCount = num(sessions?.users)
    // Total traces come from the session rollup (each trace belongs to one session), so the affected
    // traces rate has a denominator without a dedicated traces query.
    const traceCount = num(sessions?.traces_total)

    const values = emptyValues()
    values["sessions.count"] = sessionCount
    values["sessions.users"] = num(sessions?.users)
    values["sessions.cost_total"] = toDollars(sessions?.cost_total)
    values["sessions.duration_median"] = toSeconds(sessions?.duration_median)
    values["sessions.error_rate"] = num(sessions?.error_rate)
    values["sessions.cache_hit_rate"] = num(sessions?.cache_hit_rate)
    values["sessions.duration_p90"] = toSeconds(sessions?.duration_p90)
    values["sessions.duration_p95"] = toSeconds(sessions?.duration_p95)
    values["sessions.cost_avg"] = toDollars(sessions?.cost_avg)
    values["sessions.tokens_total"] = num(sessions?.tokens_total_sum)
    values["sessions.tokens_avg"] = num(sessions?.tokens_avg)
    values["sessions.ttft_median"] = toSeconds(sessions?.ttft_median)
    values["sessions.spans_avg"] = num(sessions?.spans_avg)
    values["sessions.traces_avg"] = num(sessions?.traces_avg)

    values["users.distinct"] = num(users?.distinct_users)
    values["users.sessions_per_user"] = num(users?.sessions_per_user)
    values["users.traces_per_user"] = num(users?.traces_per_user)
    values["users.cost_avg"] = toDollars(users?.cost_avg)
    values["users.duration_median"] = toSeconds(users?.duration_median)
    values["users.duration_p90"] = toSeconds(users?.duration_p90)
    values["users.duration_p95"] = toSeconds(users?.duration_p95)
    values["users.error_session_rate"] = num(users?.error_session_rate)

    const toolCalls = num(tools?.calls)
    values["tools.calls"] = toolCalls
    values["tools.distinct"] = num(tools?.distinct_tools)
    values["tools.error_rate"] = num(tools?.error_rate)
    values["tools.duration_p50"] = toSeconds(tools?.duration_p50)
    values["tools.duration_p90"] = toSeconds(tools?.duration_p90)
    values["tools.duration_p95"] = toSeconds(tools?.duration_p95)
    values["tools.sessions_with_tools_rate"] = ratio(num(tools?.sessions_with_tools), sessionCount)

    const affectedSessions = num(signals?.affected_sessions)
    const affectedTraces = num(signals?.affected_traces)
    values["signals.distinct"] = num(signals?.distinct_signals)
    values["signals.occurrences"] = num(signals?.occurrences)
    values["signals.affected_sessions_rate"] = ratio(affectedSessions, sessionCount)
    values["signals.affected_traces_rate"] = ratio(affectedTraces, traceCount)
    values["signals.affected_users"] = ratio(num(signalImpact?.affected_users), usersCount)
    values["signals.cost_impact"] = toDollars(signalImpact?.cost_impact)

    values["behaviours.observations"] = num(behaviours?.observations)
    values["behaviours.distinct_clusters"] = num(behaviours?.distinct_clusters)
    values["behaviours.moments"] = num(moments?.moments)

    const topTools: TopListItem[] = toolsTop.map((row) => ({ key: row.key, label: row.key, value: num(row.value) }))
    const topSignals: TopListItem[] = signalsTop.map((row) => {
      const id = normalizeCHString(row.key)
      return { key: id, label: id, value: num(row.value) }
    })
    const topBehaviours: TopListItem[] = behavioursTop.map((row) => ({
      key: row.key,
      label: row.key,
      value: num(row.value),
    }))

    return { values, topTools, topSignals, topBehaviours }
  })

/** Rename every `{name:Type}` placeholder (and its params key) with a prefix so per-variant params don't collide when unioned. */
const namespaceInner = (inner: InnerQuery, prefix: string): InnerQuery => {
  let sql = inner.sql
  const params: Record<string, unknown> = {}
  for (const key of Object.keys(inner.params)) {
    const next = `${prefix}${key}`
    sql = sql.split(`{${key}:`).join(`{${next}:`)
    params[next] = inner.params[key]
  }
  return { sql, params, ...(inner.clickhouseSettings ? { clickhouseSettings: inner.clickhouseSettings } : {}) }
}

const computeSummaryMetrics = (
  chSqlClient: ChSqlClientShape<ClickHouseClient>,
  input: { organizationId: OrganizationId; projectId: ProjectId; populations: readonly VariantPopulation[] },
): Effect.Effect<ExperimentSummaryCounts, RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    if (input.populations.length === 0) return { sessionsDistinct: 0, usersDistinct: 0 }

    const inners = yield* Effect.all(
      input.populations.map((population) =>
        populationInner({ organizationId: input.organizationId, projectId: input.projectId, population }),
      ),
    ).pipe(Effect.mapError((error) => toRepositoryError(error, "VariantMetricsReader")))

    const namespaced = inners.map((inner, index) => namespaceInner(inner, `v${index}_`))
    const params = Object.assign({}, ...namespaced.map((inner) => inner.params))
    const settings = Object.assign({}, ...namespaced.map((inner) => inner.clickhouseSettings ?? {}))
    const union = namespaced.map((inner) => `SELECT session_id, user_id FROM (${inner.sql})`).join(" UNION ALL ")
    const sql = `SELECT uniqExact(session_id) AS sessions, uniqExactIf(user_id, user_id != '') AS users FROM (${union})`

    const row = yield* runRow<{ sessions: string; users: string }>(chSqlClient, sql, params, withMetricGuards(settings))
    return { sessionsDistinct: num(row?.sessions), usersDistinct: num(row?.users) }
  })

const make = (): VariantMetricsReaderShape => ({
  computeVariantMetrics: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      return yield* computeVariantMetrics(chSqlClient, input)
    }),
  computeSummaryMetrics: (input) =>
    Effect.gen(function* () {
      const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
      return yield* computeSummaryMetrics(chSqlClient, input)
    }),
})

export const VariantMetricsReaderLive = Layer.succeed(VariantMetricsReader, make())
