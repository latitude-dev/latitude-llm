import type { ClickHouseClient } from "@clickhouse/client"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  type FilterCondition,
  type FilterSet,
  isNotFoundError,
  isPercentileSessionFilterField,
  NotFoundError,
  type OrganizationId,
  type PercentileSessionFilterField,
  type ProjectId,
  type RepositoryError,
  SessionId,
  SimulationId,
  SpanId,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
} from "@domain/shared"
import type {
  CohortBaselineData,
  MetricPercentiles,
  Session,
  SessionDetail,
  SessionListPage,
  SessionMetrics,
  TraceDistribution,
  TraceTimeHistogramBucket,
} from "@domain/spans"
import {
  emptySessionMetrics,
  emptyTraceDistribution,
  parseSearchQuery,
  SessionRepository,
  type SessionRepositoryShape,
} from "@domain/spans"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { SESSION_FIELD_REGISTRY } from "../registries/session-fields.ts"
import { buildScoreRollupSubquery, splitScoreFilters } from "../score-filter-subquery.ts"
import { countSessionsBySearchQuery, type FetchFullSessions, listSessionsBySearchQuery } from "./search-by-project.ts"
import { isActiveSearch } from "./search-plan.ts"

const LIST_SELECT = `
  organization_id,
  project_id,
  session_id,
  uniqExactMerge(trace_count)  AS trace_count,
  groupUniqArrayMerge(trace_ids) AS trace_ids,
  sum(span_count)              AS span_count,
  sum(error_count)             AS error_count,
  min(min_start_time)          AS start_time,
  max(max_end_time)            AS end_time,
  -- max_start_time was added by migration 00016 without a DEFAULT, so
  -- session parts ingested before the migration read back as the DateTime64
  -- zero (1970-01-01). Detect that sentinel by comparing against the
  -- session's own min_start_time and fall back to max_end_time so legacy
  -- rows still sort/display by their last known activity.
  if(max(max_start_time) >= min(min_start_time),
     max(max_start_time),
     max(max_end_time))         AS last_activity_time,
  sum(duration_ns)             AS duration_ns,
  if(
    min(time_of_first_token) < toDateTime64('2261-01-01', 9, 'UTC')
      AND min(time_of_first_token) > min(min_start_time),
    reinterpretAsInt64(min(time_of_first_token))
      - reinterpretAsInt64(min(min_start_time)),
    0
  )                              AS time_to_first_token_ns,
  sum(tokens_input)            AS tokens_input,
  sum(tokens_output)           AS tokens_output,
  sum(tokens_cache_read)       AS tokens_cache_read,
  sum(tokens_cache_create)     AS tokens_cache_create,
  sum(tokens_reasoning)        AS tokens_reasoning,
  sum(tokens_total)            AS tokens_total,
  sum(cost_input_microcents)   AS cost_input_microcents,
  sum(cost_output_microcents)  AS cost_output_microcents,
  sum(cost_total_microcents)   AS cost_total_microcents,
  argMaxIfMerge(user_id)       AS user_id,
  groupUniqArrayArray(tags)    AS tags,
  maxMap(metadata)             AS metadata,
  groupUniqArrayIfMerge(models)        AS models,
  groupUniqArrayIfMerge(providers)     AS providers,
  groupUniqArrayIfMerge(service_names) AS service_names,
  argMaxIfMerge(simulation_id)         AS simulation_id,
  argMinIfMerge(root_span_id)          AS root_span_id,
  argMinIfMerge(root_span_name)        AS root_span_name
`

const DETAIL_SELECT = `${LIST_SELECT},
  argMinIfMerge(input_messages)        AS input_messages,
  argMaxIfMerge(last_input_messages)   AS last_input_messages,
  argMaxIfMerge(output_messages)       AS output_messages,
  argMinIfMerge(system_instructions)   AS system_instructions
`

type SessionListRow = {
  organization_id: string
  project_id: string
  session_id: string
  trace_count: string
  trace_ids: string[]
  span_count: string
  error_count: string
  start_time: string
  end_time: string
  last_activity_time: string
  duration_ns: string
  time_to_first_token_ns: string
  tokens_input: string
  tokens_output: string
  tokens_cache_read: string
  tokens_cache_create: string
  tokens_reasoning: string
  tokens_total: string
  cost_input_microcents: string
  cost_output_microcents: string
  cost_total_microcents: string
  user_id: string
  tags: string[]
  metadata: Record<string, string>
  models: string[]
  providers: string[]
  service_names: string[]
  simulation_id: string
  root_span_id: string
  root_span_name: string
}

type SessionDetailRow = SessionListRow & {
  input_messages: string
  last_input_messages: string
  output_messages: string
  system_instructions: string
}

type SessionMetricsRow = {
  row_count: string
  trace_count_sum: string
  duration_min: string
  duration_max: string
  duration_avg: string
  duration_median: string
  duration_sum: string
  cost_min: string
  cost_max: string
  cost_avg: string
  cost_median: string
  cost_sum: string
  span_min: string
  span_max: string
  span_avg: string
  span_median: string
  span_sum: string
  tokens_min: string
  tokens_max: string
  tokens_avg: string
  tokens_median: string
  tokens_sum: string
  ttft_min: string
  ttft_max: string
  ttft_avg: string
  ttft_median: string
  ttft_sum: string
}

const toSessionNumericRollup = (min: string, max: string, avg: string, median: string, sum: string) => ({
  min: Number(min),
  max: Number(max),
  avg: Number(avg),
  median: Number(median),
  sum: Number(sum),
})

/** TTFT uses 0 as sentinel for "no first token"; aggregates only consider rows with TTFT > 0. */
const finiteOrZero = (raw: string): number => {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

const toTtftRollup = (row: SessionMetricsRow) => ({
  min: finiteOrZero(row.ttft_min),
  max: finiteOrZero(row.ttft_max),
  avg: finiteOrZero(row.ttft_avg),
  median: finiteOrZero(row.ttft_median),
  sum: finiteOrZero(row.ttft_sum),
})

const HISTOGRAM_BUCKET_SELECT = `count() AS session_count,
  sum(trace_count) AS trace_count,
  sum(cost_total_microcents) AS cost_sum,
  quantileTDigest(0.5)(duration_ns) AS duration_median,
  sum(tokens_total) AS tokens_sum,
  sum(span_count) AS span_sum,
  quantileTDigestIf(0.5)(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_median`

type SessionHistogramBucketRow = {
  bucket_start: string
  session_count: string
  trace_count: string
  cost_sum: string
  duration_median: string
  tokens_sum: string
  span_sum: string
  ttft_median: string
}

const toSessionHistogramBucket = (row: SessionHistogramBucketRow): TraceTimeHistogramBucket => ({
  bucketStart: parseCHDate(row.bucket_start).toISOString(),
  sessionCount: Number(row.session_count),
  traceCount: Number(row.trace_count),
  costTotalMicrocentsSum: Number(row.cost_sum),
  durationNsMedian: Number(row.duration_median),
  tokensTotalSum: Number(row.tokens_sum),
  spanCountSum: Number(row.span_sum),
  timeToFirstTokenNsMedian: finiteOrZero(row.ttft_median),
})

const toSessionMetrics = (row: SessionMetricsRow | undefined): SessionMetrics => {
  if (!row || Number(row.row_count) === 0) return emptySessionMetrics()
  return {
    durationNs: toSessionNumericRollup(
      row.duration_min,
      row.duration_max,
      row.duration_avg,
      row.duration_median,
      row.duration_sum,
    ),
    costTotalMicrocents: toSessionNumericRollup(
      row.cost_min,
      row.cost_max,
      row.cost_avg,
      row.cost_median,
      row.cost_sum,
    ),
    spanCount: toSessionNumericRollup(row.span_min, row.span_max, row.span_avg, row.span_median, row.span_sum),
    tokensTotal: toSessionNumericRollup(
      row.tokens_min,
      row.tokens_max,
      row.tokens_avg,
      row.tokens_median,
      row.tokens_sum,
    ),
    timeToFirstTokenNs: toTtftRollup(row),
    traceCount: Number(row.trace_count_sum),
  }
}

const parseMessages = (json: string): GenAIMessage[] => {
  if (!json) return []
  try {
    return JSON.parse(json) as GenAIMessage[]
  } catch {
    return []
  }
}

const parseSystem = (json: string): GenAISystem => {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? (parsed as GenAISystem) : []
  } catch {
    return []
  }
}

const toDomainSession = (row: SessionListRow): Session => ({
  organizationId: toOrganizationId(normalizeCHString(row.organization_id)),
  projectId: toProjectId(normalizeCHString(row.project_id)),
  sessionId: SessionId(normalizeCHString(row.session_id)),
  traceCount: Number(row.trace_count),
  traceIds: row.trace_ids.map(normalizeCHString),
  spanCount: Number(row.span_count),
  errorCount: Number(row.error_count),
  startTime: parseCHDate(row.start_time),
  endTime: parseCHDate(row.end_time),
  lastActivityTime: parseCHDate(row.last_activity_time),
  durationNs: Number(row.duration_ns),
  timeToFirstTokenNs: Number(row.time_to_first_token_ns),
  tokensInput: Number(row.tokens_input),
  tokensOutput: Number(row.tokens_output),
  tokensCacheRead: Number(row.tokens_cache_read),
  tokensCacheCreate: Number(row.tokens_cache_create),
  tokensReasoning: Number(row.tokens_reasoning),
  tokensTotal: Number(row.tokens_total),
  costInputMicrocents: Number(row.cost_input_microcents),
  costOutputMicrocents: Number(row.cost_output_microcents),
  costTotalMicrocents: Number(row.cost_total_microcents),
  userId: ExternalUserId(normalizeCHString(row.user_id)),
  simulationId: SimulationId(normalizeCHString(row.simulation_id)),
  tags: row.tags.map(normalizeCHString),
  metadata: row.metadata ?? {},
  models: row.models.map(normalizeCHString),
  providers: row.providers.map(normalizeCHString),
  serviceNames: row.service_names.map(normalizeCHString),
  rootSpanId: SpanId(normalizeCHString(row.root_span_id)),
  rootSpanName: normalizeCHString(row.root_span_name),
})

const toDomainSessionDetail = (row: SessionDetailRow): SessionDetail => ({
  ...toDomainSession(row),
  systemInstructions: parseSystem(row.system_instructions),
  inputMessages: parseMessages(row.input_messages),
  lastInputMessages: parseMessages(row.last_input_messages),
  outputMessages: parseMessages(row.output_messages),
})

interface SortColumn {
  readonly expr: string
  readonly chType: string
  readonly rowKey: keyof SessionListRow
}

const SORT_COLUMNS: Record<string, SortColumn> = {
  lastActivity: { expr: "last_activity_time", chType: "DateTime64(9, 'UTC')", rowKey: "last_activity_time" },
  startTime: { expr: "start_time", chType: "DateTime64(9, 'UTC')", rowKey: "start_time" },
  duration: { expr: "duration_ns", chType: "Int64", rowKey: "duration_ns" },
  ttft: { expr: "time_to_first_token_ns", chType: "Int64", rowKey: "time_to_first_token_ns" },
  cost: { expr: "cost_total_microcents", chType: "UInt64", rowKey: "cost_total_microcents" },
  spans: { expr: "span_count", chType: "UInt64", rowKey: "span_count" },
  traceCount: { expr: "trace_count", chType: "UInt64", rowKey: "trace_count" },
}

function buildSessionFilterClauses(filters: FilterSet | undefined): {
  havingClauses: string[]
  whereClauses: string[]
  params: Record<string, unknown>
} {
  if (!filters || Object.keys(filters).length === 0) {
    return { havingClauses: [], whereClauses: [], params: {} }
  }

  const { telemetryFilters, scoreFilters } = splitScoreFilters(filters)

  const telemetry = telemetryFilters
    ? buildClickHouseWhere(telemetryFilters, SESSION_FIELD_REGISTRY)
    : { clauses: [], params: {} }

  let whereClauses: string[] = []
  let scoreParams: Record<string, unknown> = {}

  if (scoreFilters) {
    const result = buildScoreRollupSubquery("session_id", scoreFilters, false)
    whereClauses = [result.subquery]
    scoreParams = result.params
  }

  return {
    havingClauses: telemetry.clauses,
    whereClauses,
    params: { ...telemetry.params, ...scoreParams },
  }
}

interface PercentileColumnSpec {
  readonly column: string
  readonly ignoreZeros: boolean
}

const PERCENTILE_FIELD_SPECS: Readonly<Record<PercentileSessionFilterField, PercentileColumnSpec>> = {
  duration: { column: "duration_ns", ignoreZeros: false },
  cost: { column: "cost_total_microcents", ignoreZeros: false },
  ttft: { column: "time_to_first_token_ns", ignoreZeros: true },
}

function quantileExpr(spec: PercentileColumnSpec, levelParam: string): string {
  return spec.ignoreZeros
    ? `quantileTDigestIf({${levelParam}:Float64})(${spec.column}, ${spec.column} > 0)`
    : `quantileTDigest({${levelParam}:Float64})(${spec.column})`
}

const PERCENTILE_NO_MATCH_SENTINEL = Number.MAX_SAFE_INTEGER

/** Number of percentile buckets sampled in the distribution: p0..p100 inclusive. */
const PERCENTILE_LEVEL_COUNT = 101
const PERCENTILE_LEVELS = Array.from({ length: PERCENTILE_LEVEL_COUNT }, (_, i) => (i / 100).toFixed(2)).join(", ")

interface PercentileRequestEntry {
  readonly field: PercentileSessionFilterField
  readonly percentile: number
  readonly conditionIndex: number
  readonly conditions: FilterCondition[]
}

function collectPercentileRequests(filters: FilterSet | undefined): {
  readonly requests: readonly PercentileRequestEntry[]
  readonly cloned: Record<string, FilterCondition[]> | undefined
} {
  if (!filters) return { requests: [], cloned: undefined }

  let cloned: Record<string, FilterCondition[]> | undefined
  const requests: PercentileRequestEntry[] = []

  for (const [field, conds] of Object.entries(filters)) {
    if (!conds) continue
    const hasPct = conds.some((c) => c.op === "gtePercentile")
    if (!hasPct) continue

    if (!isPercentileSessionFilterField(field)) continue

    if (!cloned) cloned = {}
    const arr = [...conds] as FilterCondition[]
    cloned[field] = arr
    arr.forEach((c, idx) => {
      if (c.op === "gtePercentile" && typeof c.value === "number") {
        requests.push({ field, percentile: c.value, conditionIndex: idx, conditions: arr })
      }
    })
  }

  if (!cloned) return { requests: [], cloned: undefined }

  // Carry over fields without percentile filters into the cloned set.
  for (const [field, conds] of Object.entries(filters)) {
    if (!conds) continue
    if (cloned[field]) continue
    cloned[field] = conds as FilterCondition[]
  }

  return { requests, cloned }
}

const resolvePercentileFilters = (
  organizationId: OrganizationId,
  projectId: ProjectId,
  filters: FilterSet | undefined,
): Effect.Effect<FilterSet | undefined, RepositoryError, ChSqlClient> => {
  const { requests, cloned } = collectPercentileRequests(filters)
  if (requests.length === 0 || !cloned) return Effect.succeed(filters)

  return Effect.gen(function* () {
    const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>

    const params: Record<string, unknown> = {
      organizationId: organizationId as string,
      projectId: projectId as string,
    }
    const aliases: string[] = []
    requests.forEach((req, idx) => {
      const spec = PERCENTILE_FIELD_SPECS[req.field]
      const levelParam = `pct_lvl_${idx}`
      params[levelParam] = Math.max(0, Math.min(1, req.percentile / 100))
      aliases.push(`${quantileExpr(spec, levelParam)} AS pct_${idx}`)
    })

    const rows = yield* chSqlClient
      .query(async (client) => {
        const result = await client.query({
          query: `SELECT ${aliases.join(", ")}
                  FROM (
                    SELECT ${LIST_SELECT}
                    FROM sessions
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                    GROUP BY organization_id, project_id, session_id
                  )`,
          query_params: params,
          format: "JSONEachRow",
        })
        return result.json<Record<string, number | string | null>>()
      })
      .pipe(Effect.mapError((error) => toRepositoryError(error, "resolvePercentileFilters")))

    const row = rows[0] ?? {}
    requests.forEach((req, idx) => {
      const raw = row[`pct_${idx}`]
      const numeric =
        typeof raw === "number" ? raw : raw != null && raw !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : NaN
      const threshold = Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : PERCENTILE_NO_MATCH_SENTINEL
      req.conditions[req.conditionIndex] = { op: "gte", value: threshold }
    })

    return cloned as FilterSet
  })
}

const DEFAULT_SORT: SortColumn = SORT_COLUMNS.lastActivity as SortColumn

export const SessionRepositoryLive = Layer.effect(
  SessionRepository,
  Effect.gen(function* () {
    /**
     * Fetch full `Session` rows for the matched ids returned by the
     * search rollup. Closure captures `LIST_SELECT` + `toDomainSession`,
     * which is why the search module takes this as a callback instead of
     * importing them directly (would otherwise be a circular import).
     */
    const fetchFullSessionsByIds =
      (organizationId: string, projectId: string): FetchFullSessions =>
      (sessionIds) =>
        Effect.gen(function* () {
          if (sessionIds.length === 0) return new Map<string, Session>()
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const rows = yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${LIST_SELECT}
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND session_id IN ({sessionIds:Array(String)})
                        GROUP BY organization_id, project_id, session_id`,
                query_params: { organizationId, projectId, sessionIds: [...sessionIds] },
                format: "JSONEachRow",
              })
              return result.json<SessionListRow>()
            })
            .pipe(Effect.mapError((error) => toRepositoryError(error, "listByProjectId")))
          return new Map(rows.map((r) => [normalizeCHString(r.session_id), toDomainSession(r)] as const))
        })

    const listByProjectId: SessionRepositoryShape["listByProjectId"] = ({ organizationId, projectId, options }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const limit = options.limit ?? 50

        const resolvedFilters = yield* resolvePercentileFilters(organizationId, projectId, options.filters)

        const parsed =
          options.searchQuery && options.searchQuery.length > 0 ? parseSearchQuery(options.searchQuery) : undefined

        if (parsed && isActiveSearch(parsed)) {
          return yield* listSessionsBySearchQuery({
            organizationId,
            projectId,
            parsed,
            filters: resolvedFilters,
            cursor: options.cursor,
            limit,
            sortBy: options.sortBy,
            sortDirection: options.sortDirection,
            fetchFullSessions: fetchFullSessionsByIds(organizationId as string, projectId as string),
          })
        }

        // Non-search path: unchanged from before. `searchMatches` is
        // omitted (undefined) so consumers fall through to the plain
        // session listing rendering.
        const sort = SORT_COLUMNS[options.sortBy ?? ""] ?? DEFAULT_SORT
        const orderDir = options.sortDirection === "asc" ? "ASC" : "DESC"
        const cmp = orderDir === "DESC" ? "<" : ">"

        const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(resolvedFilters)

        const havingParts: string[] = [...havingClauses]
        if (options.cursor) {
          havingParts.push(
            `(${sort.expr} ${cmp} {cursorSortValue:${sort.chType}}
                OR (${sort.expr} = {cursorSortValue:${sort.chType}}
                    AND session_id ${cmp} {cursorSessionId:String}))`,
          )
        }
        const havingClause = havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : ""
        const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${LIST_SELECT}
                      FROM sessions
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        ${extraWhere}
                      GROUP BY organization_id, project_id, session_id
                      ${havingClause}
                      ORDER BY ${sort.expr} ${orderDir}, session_id ${orderDir}
                      LIMIT {limit:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                limit: limit + 1,
                ...filterParams,
                ...(options.cursor
                  ? {
                      cursorSortValue: options.cursor.sortValue,
                      cursorSessionId: options.cursor.sessionId,
                    }
                  : {}),
              },
              format: "JSONEachRow",
            })
            return result.json<SessionListRow>()
          })
          .pipe(
            Effect.map((rows): SessionListPage => {
              const hasMore = rows.length > limit
              const pageRows = hasMore ? rows.slice(0, limit) : rows
              const items = pageRows.map(toDomainSession)
              const last = hasMore ? pageRows[pageRows.length - 1] : undefined
              if (!last) return { items, hasMore }
              return {
                items,
                hasMore,
                nextCursor: { sortValue: String(last[sort.rowKey]), sessionId: last.session_id },
              }
            }),
            Effect.mapError((error) => toRepositoryError(error, "listByProjectId")),
          )
      })

    const getCohortBaseline: SessionRepositoryShape["getCohortBaseline"] = ({
      organizationId,
      projectId,
      excludeSessionId,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const excludeClause = excludeSessionId ? `AND session_id != {excludeSessionId:String}` : ""

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                      count() AS cohort_count,
                      countIf(duration_ns > 0) AS duration_ns_samples,
                      quantileTDigestIf(0.5)(duration_ns, duration_ns > 0) AS duration_ns_p50,
                      quantileTDigestIf(0.9)(duration_ns, duration_ns > 0) AS duration_ns_p90,
                      quantileTDigestIf(0.95)(duration_ns, duration_ns > 0) AS duration_ns_p95,
                      quantileTDigestIf(0.99)(duration_ns, duration_ns > 0) AS duration_ns_p99,
                      countIf(cost_total_microcents > 0) AS cost_total_microcents_samples,
                      quantileTDigestIf(0.5)(cost_total_microcents, cost_total_microcents > 0) AS cost_total_microcents_p50,
                      quantileTDigestIf(0.9)(cost_total_microcents, cost_total_microcents > 0) AS cost_total_microcents_p90,
                      quantileTDigestIf(0.95)(cost_total_microcents, cost_total_microcents > 0) AS cost_total_microcents_p95,
                      quantileTDigestIf(0.99)(cost_total_microcents, cost_total_microcents > 0) AS cost_total_microcents_p99,
                      countIf(tokens_total > 0) AS tokens_total_samples,
                      quantileTDigestIf(0.5)(tokens_total, tokens_total > 0) AS tokens_total_p50,
                      quantileTDigestIf(0.9)(tokens_total, tokens_total > 0) AS tokens_total_p90,
                      quantileTDigestIf(0.95)(tokens_total, tokens_total > 0) AS tokens_total_p95,
                      quantileTDigestIf(0.99)(tokens_total, tokens_total > 0) AS tokens_total_p99,
                      countIf(time_to_first_token_ns > 0) AS time_to_first_token_ns_samples,
                      quantileTDigestIf(0.5)(time_to_first_token_ns, time_to_first_token_ns > 0) AS time_to_first_token_ns_p50,
                      quantileTDigestIf(0.9)(time_to_first_token_ns, time_to_first_token_ns > 0) AS time_to_first_token_ns_p90,
                      quantileTDigestIf(0.95)(time_to_first_token_ns, time_to_first_token_ns > 0) AS time_to_first_token_ns_p95,
                      quantileTDigestIf(0.99)(time_to_first_token_ns, time_to_first_token_ns > 0) AS time_to_first_token_ns_p99
                    FROM (
                      SELECT ${LIST_SELECT}
                      FROM sessions
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        ${excludeClause}
                      GROUP BY organization_id, project_id, session_id
                    )`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                ...(excludeSessionId ? { excludeSessionId: excludeSessionId as string } : {}),
              },
              format: "JSONEachRow",
            })
            return result.json<{
              cohort_count: string
              duration_ns_samples: string
              duration_ns_p50: string
              duration_ns_p90: string
              duration_ns_p95: string
              duration_ns_p99: string
              cost_total_microcents_samples: string
              cost_total_microcents_p50: string
              cost_total_microcents_p90: string
              cost_total_microcents_p95: string
              cost_total_microcents_p99: string
              tokens_total_samples: string
              tokens_total_p50: string
              tokens_total_p90: string
              tokens_total_p95: string
              tokens_total_p99: string
              time_to_first_token_ns_samples: string
              time_to_first_token_ns_p50: string
              time_to_first_token_ns_p90: string
              time_to_first_token_ns_p95: string
              time_to_first_token_ns_p99: string
            }>()
          })
          .pipe(
            Effect.map((rows): CohortBaselineData => {
              const row = rows[0]
              if (!row || Number(row.cohort_count) === 0) {
                return {
                  count: 0,
                  metrics: {
                    durationNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
                    costTotalMicrocents: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
                    tokensTotal: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
                    timeToFirstTokenNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
                  },
                }
              }

              const count = Number(row.cohort_count)
              const toMetricPercentiles = (
                samples: string,
                p50: string,
                p90: string,
                p95: string,
                p99: string,
              ): MetricPercentiles => {
                const sampleCount = Number(samples)
                return {
                  sampleCount,
                  p50: Number(p50),
                  p90: Number(p90),
                  p95: sampleCount >= 100 ? Number(p95) : null,
                  p99: sampleCount >= 1000 ? Number(p99) : null,
                }
              }

              return {
                count,
                metrics: {
                  durationNs: toMetricPercentiles(
                    row.duration_ns_samples,
                    row.duration_ns_p50,
                    row.duration_ns_p90,
                    row.duration_ns_p95,
                    row.duration_ns_p99,
                  ),
                  costTotalMicrocents: toMetricPercentiles(
                    row.cost_total_microcents_samples,
                    row.cost_total_microcents_p50,
                    row.cost_total_microcents_p90,
                    row.cost_total_microcents_p95,
                    row.cost_total_microcents_p99,
                  ),
                  tokensTotal: toMetricPercentiles(
                    row.tokens_total_samples,
                    row.tokens_total_p50,
                    row.tokens_total_p90,
                    row.tokens_total_p95,
                    row.tokens_total_p99,
                  ),
                  timeToFirstTokenNs: toMetricPercentiles(
                    row.time_to_first_token_ns_samples,
                    row.time_to_first_token_ns_p50,
                    row.time_to_first_token_ns_p90,
                    row.time_to_first_token_ns_p95,
                    row.time_to_first_token_ns_p99,
                  ),
                },
              }
            }),
            Effect.mapError((error) => toRepositoryError(error, "getCohortBaseline")),
          )
      })

    return {
      getCohortBaseline,
      listByProjectId,

      countByProjectId: ({ organizationId, projectId, filters, searchQuery }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const resolvedFilters = yield* resolvePercentileFilters(organizationId, projectId, filters)

          const parsed = searchQuery && searchQuery.length > 0 ? parseSearchQuery(searchQuery) : undefined
          if (parsed && isActiveSearch(parsed)) {
            return yield* countSessionsBySearchQuery({ organizationId, projectId, parsed, filters: resolvedFilters })
          }

          const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(resolvedFilters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT count() AS total
                      FROM (
                        SELECT session_id, ${LIST_SELECT}
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, session_id
                        ${havingClause}
                      )`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              return result.json<{ total: string }>()
            })
            .pipe(
              Effect.map((rows) => ({
                totalCount: Number(rows[0]?.total ?? 0),
              })),
              Effect.mapError((error) => toRepositoryError(error, "countByProjectId")),
            )
        }),

      aggregateMetricsByProjectId: ({ organizationId, projectId, filters }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const resolvedFilters = yield* resolvePercentileFilters(organizationId, projectId, filters)
          const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(resolvedFilters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        count() AS row_count,
                        sum(trace_count) AS trace_count_sum,
                        min(duration_ns) AS duration_min,
                        max(duration_ns) AS duration_max,
                        avg(duration_ns) AS duration_avg,
                        quantileTDigest(0.5)(duration_ns) AS duration_median,
                        sum(duration_ns) AS duration_sum,
                        min(cost_total_microcents) AS cost_min,
                        max(cost_total_microcents) AS cost_max,
                        avg(cost_total_microcents) AS cost_avg,
                        quantileTDigest(0.5)(cost_total_microcents) AS cost_median,
                        sum(cost_total_microcents) AS cost_sum,
                        min(span_count) AS span_min,
                        max(span_count) AS span_max,
                        avg(span_count) AS span_avg,
                        quantileTDigest(0.5)(span_count) AS span_median,
                        sum(span_count) AS span_sum,
                        min(tokens_total) AS tokens_min,
                        max(tokens_total) AS tokens_max,
                        avg(tokens_total) AS tokens_avg,
                        quantileTDigest(0.5)(tokens_total) AS tokens_median,
                        sum(tokens_total) AS tokens_sum,
                        minIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_min,
                        maxIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_max,
                        avgIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_avg,
                        quantileTDigestIf(0.5)(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_median,
                        sumIf(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_sum
                      FROM (
                        SELECT session_id, ${LIST_SELECT}
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, session_id
                        ${havingClause}
                      )`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              return result.json<SessionMetricsRow>()
            })
            .pipe(
              Effect.map((rows) => toSessionMetrics(rows[0])),
              Effect.mapError((error) => toRepositoryError(error, "aggregateMetricsByProjectId")),
            )
        }),

      histogramByProjectId: ({ organizationId, projectId, filters, bucketSeconds }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const resolvedFilters = yield* resolvePercentileFilters(organizationId, projectId, filters)
          const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(resolvedFilters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
          const bs = Math.floor(bucketSeconds)

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        toDateTime(
                          intDiv(toUnixTimestamp(start_time), {bucketSeconds:UInt32}) * {bucketSeconds:UInt32},
                          'UTC'
                        ) AS bucket_start,
                        ${HISTOGRAM_BUCKET_SELECT}
                      FROM (
                        SELECT session_id, ${LIST_SELECT}
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, session_id
                        ${havingClause}
                      )
                      GROUP BY bucket_start
                      ORDER BY bucket_start ASC`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  bucketSeconds: bs,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              return result.json<SessionHistogramBucketRow>()
            })
            .pipe(
              Effect.map((rows): readonly TraceTimeHistogramBucket[] => rows.map(toSessionHistogramBucket)),
              Effect.mapError((error) => toRepositoryError(error, "histogramByProjectId")),
            )
        }),

      findBySessionId: ({ organizationId, projectId, sessionId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${DETAIL_SELECT}
                      FROM sessions
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND session_id = {sessionId:String}
                      GROUP BY organization_id, project_id, session_id
                      LIMIT 1`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  sessionId: sessionId as string,
                },
                format: "JSONEachRow",
              })
              return result.json<SessionDetailRow>()
            })
            .pipe(
              Effect.flatMap((rows) => {
                const first = rows[0]
                if (!first) {
                  return Effect.fail(new NotFoundError({ entity: "Session", id: sessionId as string }))
                }
                return Effect.succeed(toDomainSessionDetail(first))
              }),
              Effect.mapError((error) =>
                isNotFoundError(error) ? error : toRepositoryError(error, "findBySessionId"),
              ),
            )
        }),

      getDistribution: ({ organizationId, projectId, field }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const spec = PERCENTILE_FIELD_SPECS[field]

          const filterClause = spec.ignoreZeros ? `, ${spec.column} > 0` : ""
          const quantilesFn = spec.ignoreZeros ? "quantilesTDigestIf" : "quantilesTDigest"
          const countFn = spec.ignoreZeros ? `countIf(${spec.column} > 0)` : "count()"

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                          ${countFn} AS cnt,
                          ${quantilesFn}(${PERCENTILE_LEVELS})(${spec.column}${filterClause}) AS pcts
                        FROM (
                          SELECT ${LIST_SELECT}
                          FROM sessions
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                          GROUP BY organization_id, project_id, session_id
                        )`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                },
                format: "JSONEachRow",
              })
              return result.json<{ cnt: string | number; pcts: ReadonlyArray<number | string | null> }>()
            })
            .pipe(
              Effect.map((rows): TraceDistribution => {
                const row = rows[0]
                if (!row) return emptyTraceDistribution()
                const count = Number(row.cnt) || 0
                if (count === 0) return emptyTraceDistribution()
                const percentileValues = (row.pcts ?? []).map((v) => {
                  const n = typeof v === "number" ? v : v != null ? Number(v) : 0
                  return Number.isFinite(n) ? n : 0
                })
                while (percentileValues.length < PERCENTILE_LEVEL_COUNT)
                  percentileValues.push(percentileValues.at(-1) ?? 0)
                if (percentileValues.length > PERCENTILE_LEVEL_COUNT) percentileValues.length = PERCENTILE_LEVEL_COUNT
                return { count, percentileValues }
              }),
              Effect.mapError((error) => toRepositoryError(error, "getDistribution")),
            )
        }),

      distinctFilterValues: ({ organizationId, projectId, column, limit: maxValues, search }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const COLUMN_EXPRS: Record<string, string> = {
            tags: "arrayJoin(groupUniqArrayArray(tags))",
            models: "arrayJoin(groupUniqArrayIfMerge(models))",
            providers: "arrayJoin(groupUniqArrayIfMerge(providers))",
            serviceNames: "arrayJoin(groupUniqArrayIfMerge(service_names))",
          }
          const expr = COLUMN_EXPRS[column]
          if (!expr) return []

          const searchClause = search ? " AND val ILIKE {search:String}" : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT DISTINCT val FROM (
                        SELECT ${expr} AS val
                        FROM sessions
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        GROUP BY organization_id, project_id, session_id
                      )
                      WHERE val != ''${searchClause}
                      ORDER BY val
                      LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  limit: maxValues ?? 50,
                  ...(search ? { search: `%${search}%` } : {}),
                },
                format: "JSONEachRow",
              })
              return result.json<{ val: string }>()
            })
            .pipe(
              Effect.map((rows) => rows.map((r) => r.val)),
              Effect.mapError((error) => toRepositoryError(error, "distinctFilterValues")),
            )
        }),
    }
  }),
)
