import type { FilterSet } from "@domain/shared"
import { parseStartTimeBoundsFromFilters } from "@domain/spans"
import { mapDateTime64UtcQueryParam } from "./registries/helpers.ts"

const MOMENTS_FILTER_FIELD = "moments"
const TOPICS_FILTER_FIELD = "topics"

/**
 * Pulls a multi-select `in` condition out of a FilterSet, returning the
 * remaining filters and the selected values. Used to peel the
 * session-intelligence fields (`moments`, `topics`) off before the
 * generic ClickHouse field registries see the set — those fields resolve via
 * dedicated subqueries, and unknown registry fields would be silently
 * skipped otherwise.
 */
function takeInValues(
  filters: FilterSet | undefined,
  field: string,
): { rest: FilterSet | undefined; values: readonly string[] | undefined } {
  const conditions = filters?.[field]
  if (!filters || !conditions) return { rest: filters, values: undefined }
  const { [field]: _conditions, ...rest } = filters
  const inCondition = conditions.find((condition) => condition.op === "in")
  const values = Array.isArray(inCondition?.value) ? inCondition.value.map(String) : []
  return {
    rest: Object.keys(rest).length > 0 ? rest : undefined,
    values: values.length > 0 ? values : undefined,
  }
}

/**
 * Pins rows to each session's current analysis generation without FINAL on
 * the analyses table: a plain GROUP BY + argMax avoids merge-on-read, and the
 * optional lower time bound prunes month partitions to the visible window
 * (sessions in the window started at/after it, and their analyses/moments
 * are indexed later still — so a lower bound is always safe, an upper bound
 * is not).
 */
const latestAnalysisSemijoin = (
  alias: string,
  withRangeStart: boolean,
): string => `(${alias}.session_id, ${alias}.analysis_hash) IN (
          SELECT session_id, argMax(analysis_hash, indexed_at)
          FROM session_analyses
          WHERE organization_id = {organizationId:String}
            AND project_id = {projectId:String}${withRangeStart ? "\n            AND start_time >= {ciRangeStart:DateTime64(9, 'UTC')}" : ""}
          GROUP BY session_id
        )`

/**
 * "Topics" filters sessions by taxonomy assignment (any-of). The caller has
 * already expanded selected tree nodes into their full subtree id lists, so
 * picking a parent topic matches every descendant.
 */
const buildTopicClustersSubquery = (withRangeStart: boolean): string => `session_id IN (
      SELECT o.session_id
      FROM taxonomy_observations AS o FINAL
      WHERE o.organization_id = {organizationId:String}
        AND o.project_id = {projectId:String}
        AND o.assigned_cluster_id IN {topicClusterIds:Array(String)}${withRangeStart ? "\n        AND o.start_time >= {ciRangeStart:DateTime64(9, 'UTC')}" : ""}
        AND ${latestAnalysisSemijoin("o", withRangeStart)}
      GROUP BY o.session_id
    )`

/**
 * "Moments" filters sessions by their detected moment labels (any-of),
 * pinned to each session's current analysis generation.
 */
const buildMomentKindsSubquery = (withRangeStart: boolean): string => `session_id IN (
      SELECT m.session_id
      FROM session_moment_labels AS m FINAL
      WHERE m.organization_id = {organizationId:String}
        AND m.project_id = {projectId:String}
        AND m.kind IN {momentKinds:Array(String)}${withRangeStart ? "\n        AND m.indexed_at >= {ciRangeStart:DateTime64(9, 'UTC')}" : ""}
        AND ${latestAnalysisSemijoin("m", withRangeStart)}
      GROUP BY m.session_id
    )`

/**
 * Splits the session-intelligence filters off a session FilterSet and
 * compiles them into `session_id IN (...)` clauses. Every session listing
 * path (plain list, count, metrics, histogram, AND text search) must apply
 * these — a path that forwards the raw FilterSet to a field registry will
 * silently drop them.
 */
export function buildSessionIntelligenceFilters(filters: FilterSet | undefined): {
  rest: FilterSet | undefined
  clauses: string[]
  params: Record<string, unknown>
} {
  const moments = takeInValues(filters, MOMENTS_FILTER_FIELD)
  const topics = takeInValues(moments.rest, TOPICS_FILTER_FIELD)
  const momentKinds = moments.values
  const topicClusterIds = topics.values

  const clauses: string[] = []
  let params: Record<string, unknown> = {}

  if (momentKinds || topicClusterIds) {
    const rangeStart = filters ? parseStartTimeBoundsFromFilters(filters).gte : undefined
    const withRangeStart = rangeStart !== undefined
    if (withRangeStart) params = { ...params, ciRangeStart: mapDateTime64UtcQueryParam(rangeStart) }
    if (momentKinds) {
      clauses.push(buildMomentKindsSubquery(withRangeStart))
      params = { ...params, momentKinds }
    }
    if (topicClusterIds) {
      clauses.push(buildTopicClustersSubquery(withRangeStart))
      params = { ...params, topicClusterIds }
    }
  }

  return { rest: topics.rest, clauses, params }
}
