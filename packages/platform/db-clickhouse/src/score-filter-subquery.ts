import type { FilterCondition, FilterSet } from "@domain/shared"
import { buildClickHouseWhere } from "./filter-builder.ts"
import { isScoreFilterKey, SCORE_FIELD_REGISTRY } from "./registries/score-fields.ts"

/**
 * Splits a FilterSet into telemetry-scoped filters and score-scoped filters.
 *
 * Score-scoped filters use the `score.*` key prefix (e.g. `score.passed`,
 * `score.source`, `score.value`). Everything else is a telemetry filter.
 */
export function splitScoreFilters(filters: FilterSet | undefined): {
  telemetryFilters: FilterSet | undefined
  scoreFilters: FilterSet | undefined
} {
  if (!filters || Object.keys(filters).length === 0) {
    return { telemetryFilters: undefined, scoreFilters: undefined }
  }

  const telemetry: Record<string, readonly FilterCondition[]> = {}
  const score: Record<string, readonly FilterCondition[]> = {}

  for (const [key, conditions] of Object.entries(filters)) {
    if (isScoreFilterKey(key)) {
      score[key] = conditions
    } else {
      telemetry[key] = conditions
    }
  }

  return {
    telemetryFilters: Object.keys(telemetry).length > 0 ? telemetry : undefined,
    scoreFilters: Object.keys(score).length > 0 ? score : undefined,
  }
}

/**
 * Builds a ClickHouse subquery that returns distinct group-column values
 * matching the given score-scoped filters. Used to filter traces/sessions
 * by score-derived properties without hot joins against raw scores.
 *
 * Delegates to `buildClickHouseWhere` with the `s` param prefix to avoid
 * collision with outer query params that use the default `f` prefix.
 *
 * @returns SQL subquery fragment and parameter bindings
 */
export function buildScoreRollupSubquery(
  groupColumn: "trace_id" | "session_id",
  scoreFilters: FilterSet,
  excludeSimulations: boolean,
  options?: {
    readonly paramPrefix?: string
  },
): {
  subquery: string
  params: Record<string, unknown>
} {
  const { clauses, params } = buildClickHouseWhere(scoreFilters, SCORE_FIELD_REGISTRY, {
    paramPrefix: options?.paramPrefix ?? "s",
  })

  const simClause = excludeSimulations ? " AND simulation_id = ''" : ""
  const scoreWhere = clauses.length > 0 ? ` AND ${clauses.join(" AND ")}` : ""

  const subquery = `${groupColumn} IN (
    SELECT ${groupColumn}
    FROM scores
    WHERE organization_id = {organizationId:String}
      AND project_id = {projectId:String}
      AND ${groupColumn} != ''${simClause}${scoreWhere}
    GROUP BY ${groupColumn}
  )`

  return { subquery, params }
}
