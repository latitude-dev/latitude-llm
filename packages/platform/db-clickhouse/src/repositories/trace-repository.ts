import type { ClickHouseClient } from "@clickhouse/client"
import { AI } from "@domain/ai"
import {
  ChSqlClient,
  type ChSqlClientShape,
  ExternalUserId,
  type FilterSet,
  isNotFoundError,
  NotFoundError,
  SessionId,
  SimulationId,
  SpanId,
  OrganizationId as toOrganizationId,
  ProjectId as toProjectId,
  toRepositoryError,
  TraceId as toTraceId,
} from "@domain/shared"
import type {
  Trace,
  TraceCohortBaselineData,
  TraceDetail,
  TraceListPage,
  TraceMetricPercentiles,
  TraceMetrics,
  TraceTimeHistogramBucket,
} from "@domain/spans"
import {
  emptyTraceMetrics,
  TRACE_SEARCH_EMBEDDING_DIMENSIONS,
  TRACE_SEARCH_EMBEDDING_MODEL,
  TRACE_SEARCH_MIN_RELEVANCE_SCORE,
  TraceRepository,
  type TraceRepositoryShape,
} from "@domain/spans"
import { normalizeCHString, parseCHDate } from "@repo/utils"
import { Effect, Layer, Option } from "effect"
import type { GenAIMessage, GenAISystem } from "rosetta-ai"
import { buildClickHouseWhere } from "../filter-builder.ts"
import { TRACE_FIELD_REGISTRY } from "../registries/trace-fields.ts"
import { buildScoreRollupSubquery, splitScoreFilters } from "../score-filter-subquery.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// Trace Search Helpers
// ═══════════════════════════════════════════════════════════════════════════════

/** Configuration for hybrid search weights (lexical vs semantic). */
const HYBRID_SEARCH_CONFIG = {
  /** Weight for lexical relevance score (0-1). */
  lexicalWeight: 0.3,
  /** Weight for semantic relevance score (0-1). */
  semanticWeight: 0.7,
} as const

/**
 * Cap on the semantic-side candidate pool. Cosine scan is linear over the
 * embeddings table; above ~10k per project latency becomes user-visible. The
 * cap trades recall on the long tail for bounded query time — realistic
 * projects stay well under this in a 30-day TTL window.
 */
const SEMANTIC_SCAN_LIMIT = 10_000

/**
 * Builds a subquery that returns matching trace_ids from trace_search_documents.
 * Uses tokenbf_v1 and ngrambf_v1 indexes for efficient lexical search.
 */
function buildLexicalSearchSubquery(searchQuery: string): { subquery: string; params: Record<string, string> } {
  // Normalize the search query for token matching
  const normalizedQuery = searchQuery.trim().toLowerCase()

  // CAST(trace_id AS String): both UNION ALL branches must produce the same
  // trace_id type, and the semantic branch returns String (post-cast) so the
  // lexical branch matches.
  return {
    subquery: `SELECT CAST(trace_id AS String) AS trace_id, 1.0 AS lexical_score FROM trace_search_documents
              WHERE organization_id = {organizationId:String}
                AND project_id = {projectId:String}
                AND search_text ILIKE {searchPattern:String}`,
    params: {
      searchPattern: `%${normalizedQuery}%`,
    },
  }
}

/**
 * Builds a subquery for semantic search candidates using pre-computed query embedding.
 * Cosine distance is converted to a similarity score: 1 - distance.
 */
function buildSemanticSearchSubquery(queryEmbedding: readonly number[]): {
  subquery: string
  params: Record<string, unknown>
} {
  return {
    subquery: `SELECT
                CAST(trace_id AS String) AS trace_id,
                (1 - cosineDistance(embedding, {queryEmbedding:Array(Float32)})) AS semantic_score
              FROM trace_search_embeddings
              WHERE organization_id = {organizationId:String}
                AND project_id = {projectId:String}
              ORDER BY cosineDistance(embedding, {queryEmbedding:Array(Float32)}) ASC
              LIMIT {semanticScanLimit:UInt32}`,
    params: {
      queryEmbedding: [...queryEmbedding],
      semanticScanLimit: SEMANTIC_SCAN_LIMIT,
    },
  }
}

/**
 * Builds a hybrid search subquery combining lexical and semantic candidates.
 * Uses a weighted combination of lexical and semantic scores.
 * Traces with only lexical matches still participate (semantic_score = 0).
 * Traces with only semantic matches also participate (lexical_score = 0).
 */
function buildHybridSearchSubquery(
  searchQuery: string,
  queryEmbedding: readonly number[] | undefined,
): { subquery: string; params: Record<string, unknown> } {
  const lexicalResult = buildLexicalSearchSubquery(searchQuery)

  // If no embedding available, fall back to lexical-only
  if (!queryEmbedding || queryEmbedding.length === 0) {
    return {
      subquery: `SELECT trace_id, lexical_score AS relevance_score FROM (${lexicalResult.subquery})`,
      params: lexicalResult.params,
    }
  }

  const semanticResult = buildSemanticSearchSubquery(queryEmbedding)

  // UNION ALL + GROUP BY rather than FULL OUTER JOIN. In ClickHouse a join
  // miss yields the column's default value (zero bytes for FixedString, empty
  // string for String), not SQL NULL, so coalesce/ifNull can't distinguish
  // "no match" from a real row. UNION ALL avoids the issue entirely.
  //
  // HAVING filters at the precision floor. With no rerank, this is the sole
  // quality gate — pure-lexical hits always pass (lexicalWeight), pure-
  // semantic hits must clear the floor via cosine similarity.
  const subquery = `SELECT
                      trace_id,
                      ({lexicalWeight:Float64} * max(lexical_score) +
                       {semanticWeight:Float64} * max(semantic_score)) AS relevance_score
                    FROM (
                      SELECT trace_id, lexical_score, 0.0 AS semantic_score
                      FROM (${lexicalResult.subquery})
                      UNION ALL
                      SELECT trace_id, 0.0 AS lexical_score, semantic_score
                      FROM (${semanticResult.subquery})
                    )
                    GROUP BY trace_id
                    HAVING relevance_score >= {minRelevanceScore:Float64}`

  return {
    subquery,
    params: {
      ...lexicalResult.params,
      ...semanticResult.params,
      lexicalWeight: HYBRID_SEARCH_CONFIG.lexicalWeight,
      semanticWeight: HYBRID_SEARCH_CONFIG.semanticWeight,
      minRelevanceScore: TRACE_SEARCH_MIN_RELEVANCE_SCORE,
    },
  }
}

/**
 * Whether the request carries an active search query. Any non-empty,
 * non-whitespace `searchQuery` flips the list and aggregate queries onto the
 * hybrid search path.
 */
function hasActiveSearchQuery(searchQuery: string | undefined): searchQuery is string {
  return !!searchQuery && searchQuery.trim().length > 0
}

const LIST_SELECT = `
  organization_id,
  project_id,
  trace_id,
  sum(span_count)              AS span_count,
  sum(error_count)             AS error_count,
  min(min_start_time)          AS start_time,
  max(max_end_time)            AS end_time,
  reinterpretAsInt64(max(max_end_time))
    - reinterpretAsInt64(min(min_start_time)) AS duration_ns,
  if(
    min(time_of_first_token) < toDateTime64('2261-01-01', 9, 'UTC'),
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
  argMaxIfMerge(session_id)    AS session_id,
  argMaxIfMerge(user_id)       AS user_id,
  groupUniqArrayArray(tags)    AS tags,
  maxMap(metadata)              AS metadata,
  argMaxIfMerge(simulation_id) AS simulation_id,
  groupUniqArrayIfMerge(models)        AS models,
  groupUniqArrayIfMerge(providers)     AS providers,
  groupUniqArrayIfMerge(service_names) AS service_names,
  argMinIfMerge(root_span_id)   AS root_span_id,
  argMinIfMerge(root_span_name) AS root_span_name
`

const DETAIL_SELECT = `${LIST_SELECT},
  argMinIfMerge(input_messages)        AS input_messages,
  argMaxIfMerge(last_input_messages)   AS last_input_messages,
  argMaxIfMerge(output_messages)       AS output_messages,
  argMinIfMerge(system_instructions)   AS system_instructions
`

type TraceListRow = {
  organization_id: string
  project_id: string
  trace_id: string
  span_count: string
  error_count: string
  start_time: string
  end_time: string
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
  session_id: string
  user_id: string
  simulation_id: string
  tags: string[]
  metadata: Record<string, string>
  models: string[]
  providers: string[]
  service_names: string[]
  root_span_id: string
  root_span_name: string
}

type TraceDetailRow = TraceListRow & {
  input_messages: string
  last_input_messages: string
  output_messages: string
  system_instructions: string
}

/**
 * Per-bucket aggregations for the histogram, computed over the trace-deduped subquery
 * (`SELECT ${LIST_SELECT} ... GROUP BY trace_id`). One row per bucket; columns mirror the
 * fields exposed on `TraceTimeHistogramBucket`. Sums use plain `sum`; medians use
 * `quantileTDigest(0.5)` (TTFT also gates on `> 0` to ignore the sentinel).
 */
const HISTOGRAM_BUCKET_SELECT = `count() AS trace_count,
  sum(cost_total_microcents) AS cost_sum,
  quantileTDigest(0.5)(duration_ns) AS duration_median,
  sum(tokens_total) AS tokens_sum,
  sum(span_count) AS span_sum,
  quantileTDigestIf(0.5)(time_to_first_token_ns, time_to_first_token_ns > 0) AS ttft_median`

type TraceHistogramBucketRow = {
  bucket_start: string
  trace_count: string
  cost_sum: string
  duration_median: string
  tokens_sum: string
  span_sum: string
  ttft_median: string
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

const toBaseFields = (row: TraceListRow): Trace => ({
  organizationId: toOrganizationId(normalizeCHString(row.organization_id)),
  projectId: toProjectId(normalizeCHString(row.project_id)),
  traceId: toTraceId(normalizeCHString(row.trace_id)),
  spanCount: Number(row.span_count),
  errorCount: Number(row.error_count),
  startTime: parseCHDate(row.start_time),
  endTime: parseCHDate(row.end_time),
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
  sessionId: SessionId(normalizeCHString(row.session_id)),
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

type TraceMetricsRow = {
  row_count: string
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

const toNumericRollup = (min: string, max: string, avg: string, median: string, sum: string) => ({
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

const toTtftRollup = (row: TraceMetricsRow) => ({
  min: finiteOrZero(row.ttft_min),
  max: finiteOrZero(row.ttft_max),
  avg: finiteOrZero(row.ttft_avg),
  median: finiteOrZero(row.ttft_median),
  sum: finiteOrZero(row.ttft_sum),
})

const toHistogramBucket = (row: TraceHistogramBucketRow): TraceTimeHistogramBucket => ({
  bucketStart: parseCHDate(row.bucket_start).toISOString(),
  traceCount: Number(row.trace_count),
  costTotalMicrocentsSum: Number(row.cost_sum),
  durationNsMedian: Number(row.duration_median),
  tokensTotalSum: Number(row.tokens_sum),
  spanCountSum: Number(row.span_sum),
  // TTFT is gated on `> 0`, so empty buckets return `nan` from the aggregate — coerce to 0.
  timeToFirstTokenNsMedian: finiteOrZero(row.ttft_median),
})

const toTraceMetrics = (row: TraceMetricsRow | undefined): TraceMetrics => {
  if (!row || Number(row.row_count) === 0) return emptyTraceMetrics()
  return {
    durationNs: toNumericRollup(
      row.duration_min,
      row.duration_max,
      row.duration_avg,
      row.duration_median,
      row.duration_sum,
    ),
    costTotalMicrocents: toNumericRollup(row.cost_min, row.cost_max, row.cost_avg, row.cost_median, row.cost_sum),
    spanCount: toNumericRollup(row.span_min, row.span_max, row.span_avg, row.span_median, row.span_sum),
    tokensTotal: toNumericRollup(row.tokens_min, row.tokens_max, row.tokens_avg, row.tokens_median, row.tokens_sum),
    timeToFirstTokenNs: toTtftRollup(row),
  }
}

const toDomainTraceDetail = (row: TraceDetailRow): TraceDetail => {
  const systemInstructions = parseSystem(row.system_instructions)
  const lastInput = parseMessages(row.last_input_messages)
  const output = parseMessages(row.output_messages)

  // Prepend system instructions as a system message at index 0
  const systemMessage: GenAIMessage | null =
    systemInstructions.length > 0 ? { role: "system", parts: systemInstructions } : null

  return {
    ...toBaseFields(row),
    systemInstructions,
    inputMessages: parseMessages(row.input_messages),
    outputMessages: output,
    allMessages: systemMessage ? [systemMessage, ...lastInput, ...output] : [...lastInput, ...output],
  }
}

interface SortColumn {
  readonly expr: string
  readonly chType: string
  readonly rowKey: keyof TraceListRow
}

const SORT_COLUMNS: Record<string, SortColumn> = {
  startTime: { expr: "start_time", chType: "DateTime64(9, 'UTC')", rowKey: "start_time" },
  duration: { expr: "duration_ns", chType: "Int64", rowKey: "duration_ns" },
  ttft: { expr: "time_to_first_token_ns", chType: "Int64", rowKey: "time_to_first_token_ns" },
  cost: { expr: "cost_total_microcents", chType: "UInt64", rowKey: "cost_total_microcents" },
  spans: { expr: "span_count", chType: "UInt64", rowKey: "span_count" },
}

function buildTraceFilterClauses(
  filters: FilterSet | undefined,
  options?: {
    readonly paramPrefix?: string
  },
): {
  /** HAVING clauses for the trace GROUP BY. */
  havingClauses: string[]
  /** WHERE clauses to add before GROUP BY (e.g. score subquery). */
  whereClauses: string[]
  params: Record<string, unknown>
} {
  if (!filters || Object.keys(filters).length === 0) {
    return { havingClauses: [], whereClauses: [], params: {} }
  }

  const { telemetryFilters, scoreFilters } = splitScoreFilters(filters)

  const telemetry = telemetryFilters
    ? buildClickHouseWhere(
        telemetryFilters,
        TRACE_FIELD_REGISTRY,
        options?.paramPrefix ? { paramPrefix: options.paramPrefix } : undefined,
      )
    : { clauses: [], params: {} }

  let whereClauses: string[] = []
  let scoreParams: Record<string, unknown> = {}

  if (scoreFilters) {
    const result = buildScoreRollupSubquery(
      "trace_id",
      scoreFilters,
      false,
      options?.paramPrefix ? { paramPrefix: `${options.paramPrefix}_s` } : undefined,
    )
    whereClauses = [result.subquery]
    scoreParams = result.params
  }

  return {
    havingClauses: telemetry.clauses,
    whereClauses,
    params: { ...telemetry.params, ...scoreParams },
  }
}

function buildTraceFilterCondition(
  filters: FilterSet | undefined,
  paramPrefix: string,
): {
  condition: string
  params: Record<string, unknown>
} {
  const { havingClauses, whereClauses, params } = buildTraceFilterClauses(filters, { paramPrefix })
  const clauses = [...whereClauses, ...havingClauses]

  return {
    condition: clauses.length > 0 ? clauses.map((clause) => `(${clause})`).join(" AND ") : "1",
    params,
  }
}

const DEFAULT_SORT: SortColumn = SORT_COLUMNS.startTime as SortColumn

export const TraceRepositoryLive = Layer.effect(
  TraceRepository,
  Effect.gen(function* () {
    const generateQueryEmbedding = (searchQuery: string): Effect.Effect<readonly number[] | undefined, never> =>
      Effect.gen(function* () {
        const aiOption = yield* Effect.serviceOption(AI)
        if (Option.isNone(aiOption)) return undefined

        const result = yield* aiOption.value
          .embed({
            text: searchQuery,
            model: TRACE_SEARCH_EMBEDDING_MODEL,
            dimensions: TRACE_SEARCH_EMBEDDING_DIMENSIONS,
            inputType: "query",
          })
          .pipe(
            Effect.tapError((error) =>
              Effect.logWarning("trace-search: query-side embedding failed; falling back to lexical-only", error),
            ),
            Effect.orElseSucceed(() => undefined),
          )

        return result?.embedding
      })

    const getCohortBaselineByTags: TraceRepositoryShape["getCohortBaselineByTags"] = ({
      organizationId,
      projectId,
      tags,
      excludeTraceId,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const excludeClause = excludeTraceId ? `AND trace_id != {excludeTraceId:FixedString(32)}` : ""
        // Canonicalize as a sorted set for stable param shape. ClickHouse stores `tags` as
        // `groupUniqArrayArray(tags)` (already deduped), so pairing `length(tags) = N` with
        // `hasAll(tags, X)` gives order-independent set equality only when the input is a set
        // too — passing duplicates (e.g. ["a","a"]) would send `tagsLen=2` and match no traces.
        // Empty `tags` degenerates to `length(tags) = 0` (hasAll is trivially true), isolating untagged traces.
        const sortedTags = [...new Set(tags)].sort()

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT
                      count() AS trace_count,
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
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        ${excludeClause}
                      GROUP BY organization_id, project_id, trace_id
                      HAVING length(tags) = {tagsLen:UInt32}
                        AND hasAll(tags, {tags:Array(String)})
                    )`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                tags: sortedTags,
                tagsLen: sortedTags.length,
                ...(excludeTraceId ? { excludeTraceId: excludeTraceId as string } : {}),
              },
              format: "JSONEachRow",
            })
            return result.json<{
              trace_count: string
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
            Effect.map((rows): TraceCohortBaselineData => {
              const row = rows[0]
              if (!row || Number(row.trace_count) === 0) {
                return {
                  traceCount: 0,
                  metrics: {
                    durationNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
                    costTotalMicrocents: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
                    tokensTotal: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
                    timeToFirstTokenNs: { sampleCount: 0, p50: 0, p90: 0, p95: null, p99: null },
                  },
                }
              }

              const traceCount = Number(row.trace_count)
              const toMetricPercentiles = (
                samples: string,
                p50: string,
                p90: string,
                p95: string,
                p99: string,
              ): TraceMetricPercentiles => {
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
                traceCount,
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
            Effect.mapError((error) => toRepositoryError(error, "getCohortBaselineByTags")),
          )
      })

    const listByProjectId: TraceRepositoryShape["listByProjectId"] = ({ organizationId, projectId, options }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const limit = options.limit ?? 50

        const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(options.filters)
        const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

        if (hasActiveSearchQuery(options.searchQuery)) {
          const searchQuery = options.searchQuery
          const queryEmbedding = yield* generateQueryEmbedding(searchQuery)
          const searchResult = buildHybridSearchSubquery(searchQuery, queryEmbedding)

          const cursorClause = options.cursor
            ? `AND (search_results.relevance_score, t.trace_id) <
                 ({cursorSortValue:Float64}, {cursorTraceId:FixedString(32)})`
            : ""

          const finalHaving = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `WITH search_results AS (
                          SELECT trace_id, relevance_score FROM (${searchResult.subquery})
                        )
                        SELECT ${LIST_SELECT},
                               search_results.relevance_score
                        FROM traces t
                        INNER JOIN search_results ON t.trace_id = search_results.trace_id
                        WHERE t.organization_id = {organizationId:String}
                          AND t.project_id = {projectId:String}
                          ${extraWhere}
                          ${cursorClause}
                        GROUP BY t.organization_id, t.project_id, t.trace_id, search_results.relevance_score
                        ${finalHaving}
                        ORDER BY search_results.relevance_score DESC, t.trace_id DESC
                        LIMIT {limit:UInt32}`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  limit: limit + 1,
                  ...filterParams,
                  ...searchResult.params,
                  ...(options.cursor
                    ? {
                        cursorSortValue: options.cursor.sortValue,
                        cursorTraceId: options.cursor.traceId,
                      }
                    : {}),
                },
                format: "JSONEachRow",
              })
              return result.json<TraceListRow & { relevance_score?: number }>()
            })
            .pipe(
              Effect.map((rows): TraceListPage => {
                const hasMore = rows.length > limit
                const pageRows = hasMore ? rows.slice(0, limit) : rows
                const items = pageRows.map(toBaseFields)
                const last = hasMore ? pageRows[pageRows.length - 1] : undefined
                if (!last) return { items, hasMore }
                return {
                  items,
                  hasMore,
                  nextCursor: {
                    sortValue: String(last.relevance_score ?? 0),
                    traceId: last.trace_id,
                  },
                }
              }),
              Effect.mapError((error) => toRepositoryError(error, "listByProjectId")),
            )
        }

        const sort = SORT_COLUMNS[options.sortBy ?? ""] ?? DEFAULT_SORT
        const orderDir = options.sortDirection === "asc" ? "ASC" : "DESC"
        const cmp = orderDir === "DESC" ? "<" : ">"
        const havingParts: string[] = [...havingClauses]
        if (options.cursor) {
          havingParts.push(
            `(${sort.expr} ${cmp} {cursorSortValue:${sort.chType}}
                OR (${sort.expr} = {cursorSortValue:${sort.chType}}
                    AND trace_id ${cmp} {cursorTraceId:FixedString(32)}))`,
          )
        }
        const finalHaving = havingParts.length > 0 ? `HAVING ${havingParts.join(" AND ")}` : ""

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${LIST_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        ${extraWhere}
                      GROUP BY organization_id, project_id, trace_id
                      ${finalHaving}
                      ORDER BY ${sort.expr} ${orderDir}, trace_id ${orderDir}
                      LIMIT {limit:UInt32}`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                limit: limit + 1,
                ...filterParams,
                ...(options.cursor
                  ? {
                      cursorSortValue: options.cursor.sortValue,
                      cursorTraceId: options.cursor.traceId,
                    }
                  : {}),
              },
              format: "JSONEachRow",
            })
            return result.json<TraceListRow>()
          })
          .pipe(
            Effect.map((rows): TraceListPage => {
              const hasMore = rows.length > limit
              const pageRows = hasMore ? rows.slice(0, limit) : rows
              const items = pageRows.map(toBaseFields)
              const last = hasMore ? pageRows[pageRows.length - 1] : undefined
              if (!last) return { items, hasMore }
              return {
                items,
                hasMore,
                nextCursor: { sortValue: String(last[sort.rowKey]), traceId: last.trace_id },
              }
            }),
            Effect.mapError((error) => toRepositoryError(error, "listByProjectId")),
          )
      })

    const listByTraceIds: TraceRepositoryShape["listByTraceIds"] = ({ organizationId, projectId, traceIds }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        if (traceIds.length === 0) return []

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT ${DETAIL_SELECT}
                    FROM traces
                    WHERE organization_id = {organizationId:String}
                      AND project_id = {projectId:String}
                      AND trace_id IN ({traceIds:Array(String)})
                    GROUP BY organization_id, project_id, trace_id`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                traceIds: Array.from(traceIds) as string[],
              },
              format: "JSONEachRow",
            })
            return result.json<TraceDetailRow>()
          })
          .pipe(
            Effect.map((rows) => rows.map(toDomainTraceDetail)),
            Effect.mapError((error) => toRepositoryError(error, "listByTraceIds")),
          )
      })

    const matchesFiltersByTraceId: TraceRepositoryShape["matchesFiltersByTraceId"] = ({
      organizationId,
      projectId,
      traceId,
      filters,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
        const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
        const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT count() AS total
                    FROM (
                      SELECT ${LIST_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id = {traceId:FixedString(32)}
                        ${extraWhere}
                      GROUP BY organization_id, project_id, trace_id
                      ${havingClause}
                      LIMIT 1
                    )`,
              query_params: {
                organizationId: organizationId as string,
                projectId: projectId as string,
                traceId,
                ...filterParams,
              },
              format: "JSONEachRow",
            })
            return result.json<{ total: string }>()
          })
          .pipe(
            Effect.map((rows) => Number(rows[0]?.total ?? 0) > 0),
            Effect.mapError((error) => toRepositoryError(error, "matchesFiltersByTraceId")),
          )
      })

    const listMatchingFilterIdsByTraceId: TraceRepositoryShape["listMatchingFilterIdsByTraceId"] = ({
      organizationId,
      projectId,
      traceId,
      filterSets,
    }) =>
      Effect.gen(function* () {
        const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
        if (filterSets.length === 0) {
          return []
        }

        const queryParams: Record<string, unknown> = {
          organizationId: organizationId as string,
          projectId: projectId as string,
          traceId,
        }

        const matchExpressions = filterSets.map(({ filterId, filters }, index) => {
          const { condition, params } = buildTraceFilterCondition(filters, `batch_${index}`)
          const filterIdParam = `filter_id_${index}`

          Object.assign(queryParams, params, { [filterIdParam]: filterId })

          return `if(${condition}, {${filterIdParam}:String}, '')`
        })

        return yield* chSqlClient
          .query(async (client) => {
            const result = await client.query({
              query: `SELECT matched_filter_id
                    FROM (
                      SELECT arrayJoin([
                        ${matchExpressions.join(",\n                        ")}
                      ]) AS matched_filter_id
                      FROM (
                        SELECT ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND trace_id = {traceId:FixedString(32)}
                        GROUP BY organization_id, project_id, trace_id
                        LIMIT 1
                      )
                    )
                    WHERE matched_filter_id != ''`,
              query_params: queryParams,
              format: "JSONEachRow",
            })
            return result.json<{ matched_filter_id: string }>()
          })
          .pipe(
            Effect.map((rows) => rows.map((row) => row.matched_filter_id)),
            Effect.mapError((error) => toRepositoryError(error, "listMatchingFilterIdsByTraceId")),
          )
      })

    return {
      getCohortBaselineByTags,
      listByProjectId,

      countByProjectId: ({ organizationId, projectId, filters, searchQuery }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

          if (hasActiveSearchQuery(searchQuery)) {
            const queryEmbedding = yield* generateQueryEmbedding(searchQuery)
            const searchResult = buildHybridSearchSubquery(searchQuery, queryEmbedding)
            const searchCondition = `AND trace_id IN (SELECT trace_id FROM (${searchResult.subquery}))`

            return yield* chSqlClient
              .query(async (client) => {
                const result = await client.query({
                  query: `SELECT count() AS total
                        FROM (
                          SELECT ${LIST_SELECT}
                          FROM traces
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${extraWhere}
                            ${searchCondition}
                          GROUP BY organization_id, project_id, trace_id
                          ${havingClause}
                        )`,
                  query_params: {
                    organizationId: organizationId as string,
                    projectId: projectId as string,
                    ...filterParams,
                    ...searchResult.params,
                  },
                  format: "JSONEachRow",
                })
                return result.json<{ total: string }>()
              })
              .pipe(
                Effect.map((rows) => Number(rows[0]?.total ?? 0)),
                Effect.mapError((error) => toRepositoryError(error, "countByProjectId")),
              )
          }

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT count() AS total
                      FROM (
                        SELECT ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, trace_id
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
              Effect.map((rows) => Number(rows[0]?.total ?? 0)),
              Effect.mapError((error) => toRepositoryError(error, "countByProjectId")),
            )
        }),

      findLastTraceAt: ({ organizationId, projectId, filters, searchQuery }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

          const runQuery = (extraJoinCondition: string, extraParams: Record<string, unknown>) =>
            chSqlClient
              .query(async (client) => {
                const result = await client.query({
                  query: `SELECT toString(max(start_time)) AS last_at
                        FROM (
                          SELECT ${LIST_SELECT}
                          FROM traces
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${extraWhere}
                            ${extraJoinCondition}
                          GROUP BY organization_id, project_id, trace_id
                          ${havingClause}
                        )`,
                  query_params: {
                    organizationId: organizationId as string,
                    projectId: projectId as string,
                    ...filterParams,
                    ...extraParams,
                  },
                  format: "JSONEachRow",
                })
                return result.json<{ last_at: string | null }>()
              })
              .pipe(
                Effect.map((rows) => {
                  const raw = rows[0]?.last_at ?? null
                  if (!raw) return null
                  const parsed = new Date(raw.includes(" ") ? raw.replace(" ", "T") + "Z" : raw)
                  return Number.isNaN(parsed.getTime()) ? null : parsed
                }),
                Effect.mapError((error) => toRepositoryError(error, "findLastTraceAt")),
              )

          if (hasActiveSearchQuery(searchQuery)) {
            const queryEmbedding = yield* generateQueryEmbedding(searchQuery)
            const searchResult = buildHybridSearchSubquery(searchQuery, queryEmbedding)
            return yield* runQuery(
              `AND trace_id IN (SELECT trace_id FROM (${searchResult.subquery}))`,
              searchResult.params,
            )
          }

          return yield* runQuery("", {})
        }),

      countAnnotatedByProjectId: ({ organizationId, projectId, filters, searchQuery }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

          const runQuery = (extraJoinCondition: string, extraParams: Record<string, unknown>) =>
            chSqlClient
              .query(async (client) => {
                const result = await client.query({
                  query: `SELECT count(DISTINCT trace_id) AS total
                        FROM scores
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          AND source = {annotationSource:FixedString(32)}
                          AND trace_id IN (
                            SELECT trace_id
                            FROM (
                              SELECT ${LIST_SELECT}
                              FROM traces
                              WHERE organization_id = {organizationId:String}
                                AND project_id = {projectId:String}
                                ${extraWhere}
                                ${extraJoinCondition}
                              GROUP BY organization_id, project_id, trace_id
                              ${havingClause}
                            )
                          )`,
                  query_params: {
                    organizationId: organizationId as string,
                    projectId: projectId as string,
                    annotationSource: "annotation",
                    ...filterParams,
                    ...extraParams,
                  },
                  format: "JSONEachRow",
                })
                return result.json<{ total: string }>()
              })
              .pipe(
                Effect.map((rows) => Number(rows[0]?.total ?? 0)),
                Effect.mapError((error) => toRepositoryError(error, "countAnnotatedByProjectId")),
              )

          if (hasActiveSearchQuery(searchQuery)) {
            const queryEmbedding = yield* generateQueryEmbedding(searchQuery)
            const searchResult = buildHybridSearchSubquery(searchQuery, queryEmbedding)
            return yield* runQuery(
              `AND trace_id IN (SELECT trace_id FROM (${searchResult.subquery}))`,
              searchResult.params,
            )
          }

          return yield* runQuery("", {})
        }),

      aggregateMetricsByProjectId: ({ organizationId, projectId, filters, searchQuery }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

          if (hasActiveSearchQuery(searchQuery)) {
            const queryEmbedding = yield* generateQueryEmbedding(searchQuery)
            const searchResult = buildHybridSearchSubquery(searchQuery, queryEmbedding)
            const searchCondition = `AND trace_id IN (SELECT trace_id FROM (${searchResult.subquery}))`

            return yield* chSqlClient
              .query(async (client) => {
                const result = await client.query({
                  query: `SELECT
                          count() AS row_count,
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
                          SELECT ${LIST_SELECT}
                          FROM traces
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${extraWhere}
                            ${searchCondition}
                          GROUP BY organization_id, project_id, trace_id
                          ${havingClause}
                        )`,
                  query_params: {
                    organizationId: organizationId as string,
                    projectId: projectId as string,
                    ...filterParams,
                    ...searchResult.params,
                  },
                  format: "JSONEachRow",
                })
                return result.json<TraceMetricsRow>()
              })
              .pipe(
                Effect.map((rows) => toTraceMetrics(rows[0])),
                Effect.mapError((error) => toRepositoryError(error, "aggregateMetricsByProjectId")),
              )
          }

          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT
                        count() AS row_count,
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
                        SELECT ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, trace_id
                        ${havingClause}
                      )`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  ...filterParams,
                },
                format: "JSONEachRow",
              })
              return result.json<TraceMetricsRow>()
            })
            .pipe(
              Effect.map((rows) => toTraceMetrics(rows[0])),
              Effect.mapError((error) => toRepositoryError(error, "aggregateMetricsByProjectId")),
            )
        }),

      histogramByProjectId: ({ organizationId, projectId, filters, bucketSeconds, searchQuery }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          const { havingClauses, whereClauses, params: filterParams } = buildTraceFilterClauses(filters)
          const havingClause = havingClauses.length > 0 ? `HAVING ${havingClauses.join(" AND ")}` : ""
          const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
          const bs = Math.floor(bucketSeconds)

          if (hasActiveSearchQuery(searchQuery)) {
            const queryEmbedding = yield* generateQueryEmbedding(searchQuery)
            const searchResult = buildHybridSearchSubquery(searchQuery, queryEmbedding)
            const searchCondition = `AND trace_id IN (SELECT trace_id FROM (${searchResult.subquery}))`

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
                          SELECT ${LIST_SELECT}
                          FROM traces
                          WHERE organization_id = {organizationId:String}
                            AND project_id = {projectId:String}
                            ${extraWhere}
                            ${searchCondition}
                          GROUP BY organization_id, project_id, trace_id
                          ${havingClause}
                        )
                        GROUP BY bucket_start
                        ORDER BY bucket_start ASC`,
                  query_params: {
                    organizationId: organizationId as string,
                    projectId: projectId as string,
                    bucketSeconds: bs,
                    ...filterParams,
                    ...searchResult.params,
                  },
                  format: "JSONEachRow",
                })
                return result.json<TraceHistogramBucketRow>()
              })
              .pipe(
                Effect.map((rows): readonly TraceTimeHistogramBucket[] => rows.map(toHistogramBucket)),
                Effect.mapError((error) => toRepositoryError(error, "histogramByProjectId")),
              )
          }

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
                        SELECT ${LIST_SELECT}
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                          ${extraWhere}
                        GROUP BY organization_id, project_id, trace_id
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
              return result.json<TraceHistogramBucketRow>()
            })
            .pipe(
              Effect.map((rows): readonly TraceTimeHistogramBucket[] => rows.map(toHistogramBucket)),
              Effect.mapError((error) => toRepositoryError(error, "histogramByProjectId")),
            )
        }),

      findByTraceId: ({ organizationId, projectId, traceId }) =>
        Effect.gen(function* () {
          const chSqlClient = (yield* ChSqlClient) as ChSqlClientShape<ClickHouseClient>
          return yield* chSqlClient
            .query(async (client) => {
              const result = await client.query({
                query: `SELECT ${DETAIL_SELECT}
                      FROM traces
                      WHERE organization_id = {organizationId:String}
                        AND project_id = {projectId:String}
                        AND trace_id = {traceId:FixedString(32)}
                      GROUP BY organization_id, project_id, trace_id
                      LIMIT 1`,
                query_params: {
                  organizationId: organizationId as string,
                  projectId: projectId as string,
                  traceId,
                },
                format: "JSONEachRow",
              })
              return result.json<TraceDetailRow>()
            })
            .pipe(
              Effect.flatMap((rows) => {
                const first = rows[0]
                if (!first) {
                  return Effect.fail(new NotFoundError({ entity: "Trace", id: traceId as string }))
                }
                return Effect.succeed(toDomainTraceDetail(first))
              }),
              Effect.mapError((error) => (isNotFoundError(error) ? error : toRepositoryError(error, "findByTraceId"))),
            )
        }),

      matchesFiltersByTraceId,

      listMatchingFilterIdsByTraceId,

      listByTraceIds,

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
                        FROM traces
                        WHERE organization_id = {organizationId:String}
                          AND project_id = {projectId:String}
                        GROUP BY organization_id, project_id, trace_id
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
