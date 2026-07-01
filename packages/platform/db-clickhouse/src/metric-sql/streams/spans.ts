import type { SpanBreakdownField } from "@domain/shared"
import { Effect } from "effect"
import { buildSpanFilterClauses } from "../../registries/span-fields.ts"
import { type TraceFamilyColumns, traceFamilyAggregate, usageGated, windowParams } from "../helpers.ts"
import type { BreakdownExpr, InnerQuery, MetricSqlInput, StreamDescriptor } from "../types.ts"

// Spans are row-grained; cost/tokens are gated to billable operations (NULL
// otherwise) so sum/avg ignore wrapper + tool spans, while count/errorRate/
// duration still span all rows.
const COLUMNS: TraceFamilyColumns = {
  count: "count()",
  isError: "status_code = 2",
  duration: "duration_ns",
  cost: usageGated("cost_total_microcents"),
  tokens: usageGated("tokens_input + tokens_output"),
  inputTokens: usageGated("tokens_input"),
  cacheRead: usageGated("tokens_cache_read"),
  cacheCreate: usageGated("tokens_cache_create"),
}

// Span dims are scalar (one value per span) except `tag`; `operation` is
// span-specific. The inner SELECT must expose every referenced column.
const BREAKDOWN = {
  model: { expr: "model", isArray: false },
  provider: { expr: "provider", isArray: false },
  service: { expr: "service_name", isArray: false },
  tool: { expr: "tool_name", isArray: false },
  tag: { expr: "tags", isArray: true },
  operation: { expr: "operation", isArray: false },
  status: { expr: "if(status_code = 2, 'error', 'success')", isArray: false },
} satisfies Record<SpanBreakdownField, BreakdownExpr>

/**
 * Per-span subquery: one row per span, windowed on the span's own `start_time`
 * (plain WHERE — no aggregation), filtered by the row-local span predicate. The
 * outer metric then aggregates these rows (no dedup — same convention as
 * tool-analytics over `execute_tool` spans).
 */
const buildInner = (input: MetricSqlInput): InnerQuery => {
  const { whereClauses, params: filterParams } = buildSpanFilterClauses(input.target.filterSet)
  const extraWhere = whereClauses.length > 0 ? `AND ${whereClauses.join(" AND ")}` : ""
  return {
    sql: `SELECT span_id, start_time, status_code, operation, model, provider, service_name, tool_name, tags, duration_ns, cost_total_microcents, tokens_input, tokens_output, tokens_cache_read, tokens_cache_create
          FROM spans
          WHERE organization_id = {organizationId:String}
            AND project_id = {projectId:String}
            AND start_time >= toDateTime64({windowFrom:String}, 9, 'UTC')
            AND start_time < toDateTime64({windowTo:String}, 9, 'UTC')
            ${extraWhere}`,
    params: {
      ...windowParams({
        organizationId: input.organizationId as string,
        projectId: input.projectId as string,
        from: input.from,
        to: input.to,
      }),
      ...filterParams,
    },
  }
}

export const spansDescriptor: StreamDescriptor<"spans"> = {
  buildInner: (input) => Effect.succeed(buildInner(input)),
  aggregate: (metric) => traceFamilyAggregate(metric, COLUMNS),
  breakdowns: BREAKDOWN,
  timeColumn: "start_time",
}
