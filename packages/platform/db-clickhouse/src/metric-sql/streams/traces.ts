import type { ChSqlClient, RepositoryError, TraceBreakdownField, ValidationError } from "@domain/shared"
import { parseSearchQuery } from "@domain/spans"
import { Effect } from "effect"
import { runFilterBuild } from "../../filter-builder.ts"
import { isActiveSearch, planSearch } from "../../repositories/search-plan.ts"
import { buildTraceFilterClauses, LIST_SELECT, resolvePercentileFilters } from "../../repositories/trace-repository.ts"
import { type TraceFamilyColumns, traceFamilyAggregate, windowClauses, windowParams } from "../helpers.ts"
import type { BreakdownExpr, InnerQuery, MetricSqlInput, StreamDescriptor } from "../types.ts"

const COLUMNS: TraceFamilyColumns = {
  count: "uniqExact(coalesce(nullIf(session_id, ''), toString(trace_id)))",
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

// A span is exported when it ends and the root outlives its children, so the root's arrival is
// the only immutable "trace finished" signal: `end_time` alone advances with every child that lands.
const ROOT_SPAN_INGESTED = "notEmpty(replaceRegexpAll(toString(root_span_id), '\\0', ''))"

/**
 * The grouped per-trace subquery: filters + percentile resolution + an optional
 * semantic-query prefilter, windowed on the aggregated start or completion time.
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

    const axis = input.timeAxis ?? "start"
    const having = [
      ...windowClauses({ axis, startColumn: "start_time", completionColumn: "end_time", precision: 9 }),
      ...(axis === "completion" ? [ROOT_SPAN_INGESTED] : []),
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
  timeColumn: "start_time",
  completionTimeColumn: "end_time",
}
