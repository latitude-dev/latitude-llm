import type { ChSqlClient, RepositoryError, TraceBreakdownField, ValidationError } from "@domain/shared"
import { parseSearchQuery } from "@domain/spans"
import { Effect } from "effect"
import { runFilterBuild } from "../../filter-builder.ts"
import { isActiveSearch, planSearch } from "../../repositories/search-plan.ts"
import { buildTraceFilterClauses, LIST_SELECT, resolvePercentileFilters } from "../../repositories/trace-repository.ts"
import { anchorColumn, type TraceFamilyColumns, traceFamilyAggregate, windowParams } from "../helpers.ts"
import type { BreakdownExpr, InnerQuery, MetricSqlInput, StreamDescriptor } from "../types.ts"

const TIME_COLUMNS = { start: "start_time", end: "end_time" } as const

// A trace whose spans carry a session id counts as its session, so a session's
// traces collapse to one entity — `ENTITY_ID_EXPR` must stay at this grain.
const ENTITY_ID_EXPR = "coalesce(nullIf(session_id, ''), toString(trace_id))"

const COLUMNS: TraceFamilyColumns = {
  count: `uniqExact(${ENTITY_ID_EXPR})`,
  isError: "error_count > 0",
  duration: "duration_ns",
  cost: "cost_total_microcents",
  tokens: "tokens_total",
  inputTokens: "tokens_input",
  cacheRead: "tokens_cache_read",
  cacheCreate: "tokens_cache_create",
}

const BREAKDOWN = {
  model: { expr: "models", isArray: true },
  provider: { expr: "providers", isArray: true },
  service: { expr: "service_names", isArray: true },
  tool: { expr: "tools", isArray: true },
  tag: { expr: "tags", isArray: true },
  name: { expr: "root_span_name", isArray: false },
  userId: { expr: "user_id", isArray: false },
  status: { expr: "if(error_count > 0, 'error', 'success')", isArray: false },
} satisfies Record<TraceBreakdownField, BreakdownExpr>

/**
 * The grouped per-trace subquery: filters + percentile resolution + an optional
 * semantic-query prefilter, windowed on the aggregated `start_time` (or
 * `end_time` when the caller anchors on activity).
 */
const buildInner = (input: MetricSqlInput): Effect.Effect<InnerQuery, RepositoryError | ValidationError, ChSqlClient> =>
  Effect.gen(function* () {
    const filterSet = yield* resolvePercentileFilters(input.organizationId, input.projectId, input.filterSet)
    const {
      havingClauses,
      whereClauses,
      params: filterParams,
    } = yield* runFilterBuild(() => buildTraceFilterClauses(filterSet))
    const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""

    const parsed = input.query ? parseSearchQuery(input.query) : undefined
    let searchCondition = ""
    let searchParams: Record<string, unknown> = {}
    let clickhouseSettings: Record<string, string | number | boolean> | undefined
    if (parsed && isActiveSearch(parsed)) {
      const plan = yield* planSearch(parsed)
      searchCondition = `AND trace_id IN (SELECT trace_id FROM (${plan.subquery}))`
      searchParams = plan.params
      clickhouseSettings = plan.clickhouseSettings
    }

    const windowColumn = anchorColumn(TIME_COLUMNS, input.windowAnchor)
    const having = [
      `${windowColumn} >= toDateTime64({windowFrom:String}, 9, 'UTC')`,
      `${windowColumn} < toDateTime64({windowTo:String}, 9, 'UTC')`,
      ...havingClauses,
    ].join(" AND ")

    return {
      sql: `SELECT ${LIST_SELECT}
            FROM traces
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}
              ${extraWhere}
              ${searchCondition}
            GROUP BY organization_id, project_id, trace_id
            HAVING ${having}`,
      params: {
        ...windowParams({
          organizationId: input.organizationId as string,
          projectId: input.projectId as string,
          from: input.from,
          to: input.to,
        }),
        ...filterParams,
        ...searchParams,
      },
      ...(clickhouseSettings ? { clickhouseSettings } : {}),
    }
  })

export const tracesDescriptor: StreamDescriptor<"traces"> = {
  buildInner,
  aggregate: (metric) => traceFamilyAggregate(metric, COLUMNS),
  breakdowns: BREAKDOWN,
  timeColumns: TIME_COLUMNS,
  entityIdExpr: ENTITY_ID_EXPR,
}
