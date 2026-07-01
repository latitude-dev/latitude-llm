import type { ChSqlClient, MonitorMetric, RepositoryError, SessionBreakdownField } from "@domain/shared"
import { parseSearchQuery } from "@domain/spans"
import { Effect } from "effect"
import { isActiveSearch, planSearch } from "../../repositories/search-plan.ts"
import {
  buildSessionFilterClauses,
  LIST_SELECT,
  resolvePercentileFilters,
} from "../../repositories/session-repository.ts"
import { type TraceFamilyColumns, traceFamilyAggregate, windowParams } from "../helpers.ts"
import type { BreakdownExpr, InnerQuery, MetricSqlInput, StreamDescriptor } from "../types.ts"

// Sessions share the trace rollup columns; each inner row is already one session,
// so the count is a plain row count rather than a trace/session dedup.
const COLUMNS: TraceFamilyColumns = {
  count: "count()",
  isError: "error_count > 0",
  duration: "duration_ns",
  cost: "cost_total_microcents",
  tokens: "tokens_total",
  inputTokens: "tokens_input",
  cacheRead: "tokens_cache_read",
  cacheCreate: "tokens_cache_create",
}

// Same array/scalar dims as traces (the session rollup exposes the same aliases),
// minus `name` — a session has no single root span.
const BREAKDOWN = {
  model: { expr: "models", isArray: true },
  provider: { expr: "providers", isArray: true },
  service: { expr: "service_names", isArray: true },
  tool: { expr: "tools", isArray: true },
  tag: { expr: "tags", isArray: true },
  userId: { expr: "user_id", isArray: false },
  status: { expr: "if(error_count > 0, 'error', 'success')", isArray: false },
} satisfies Record<SessionBreakdownField, BreakdownExpr>

/**
 * The grouped per-session subquery. The window is a `HAVING` on the aggregated
 * `start_time`, combined with the target's filters and (optionally) a semantic
 * query: the trace-grained search plan resolves to its sessions via the `traces`
 * rollup, restricting the session set with `session_id IN (…)`.
 */
const buildInner = (input: MetricSqlInput): Effect.Effect<InnerQuery, RepositoryError, ChSqlClient> =>
  Effect.gen(function* () {
    const filterSet = yield* resolvePercentileFilters(input.organizationId, input.projectId, input.target.filterSet)
    const { havingClauses, whereClauses, params: filterParams } = buildSessionFilterClauses(filterSet)

    const parsed = input.target.query ? parseSearchQuery(input.target.query) : undefined
    let searchCondition = ""
    let searchParams: Record<string, unknown> = {}
    let clickhouseSettings: Record<string, string | number | boolean> | undefined
    if (parsed && isActiveSearch(parsed)) {
      const plan = yield* planSearch(parsed)
      // Trace-grained search → sessions: resolve matching traces to their session.
      searchCondition = `AND session_id IN (
        SELECT nullIf(argMaxIfMerge(session_id), '')
        FROM traces
        WHERE organization_id = {organizationId:String}
          AND project_id = {projectId:String}
          AND trace_id IN (SELECT trace_id FROM (${plan.subquery}))
        GROUP BY organization_id, project_id, trace_id
      )`
      searchParams = plan.params
      clickhouseSettings = plan.clickhouseSettings
    }

    const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
    const having = [
      "start_time >= toDateTime64({windowFrom:String}, 9, 'UTC')",
      "start_time < toDateTime64({windowTo:String}, 9, 'UTC')",
      ...havingClauses,
    ].join(" AND ")

    return {
      sql: `SELECT ${LIST_SELECT}
            FROM sessions
            WHERE organization_id = {organizationId:String}
              AND project_id = {projectId:String}
              ${extraWhere}
              ${searchCondition}
            GROUP BY organization_id, project_id, session_id
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

export const sessionsDescriptor: StreamDescriptor = {
  buildInner,
  aggregate: (metric) => traceFamilyAggregate(metric as MonitorMetric, COLUMNS),
  breakdowns: BREAKDOWN,
  timeColumn: "start_time",
}
