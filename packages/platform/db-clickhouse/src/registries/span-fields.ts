import type { FilterSet } from "@domain/shared"
import { buildClickHouseWhere, type ChFieldRegistry } from "../filter-builder.ts"

/**
 * Span-level filter fields for the `spans` stream (one row per span). Mirrors the
 * trace/session registries but maps to raw `spans` columns — `operation` +
 * `tool_name` let a tool monitor scope to `execute_tool` spans of one tool.
 * `duration_ns` is an alias column (read-time `end − start`). `gtePercentile` is
 * rejected at the API boundary for span row filters; callers must use absolute
 * thresholds or a spans-stream percentile metric via `queryAnalytics`.
 */
const SPAN_FIELD_REGISTRY: ChFieldRegistry = {
  operation: { column: "operation", chType: "String" },
  toolName: { column: "tool_name", chType: "String" },
  name: { column: "name", chType: "String" },
  model: { column: "model", chType: "String" },
  provider: { column: "provider", chType: "String" },
  userId: { column: "user_id", chType: "String" },
  sessionId: { column: "session_id", chType: "String" },
  traceId: { column: "trace_id", chType: "String" },
  tags: { column: "tags", chType: "String", isArray: true, arrayContains: true },
  duration: { column: "duration_ns", chType: "Int64" },
  cost: { column: "cost_total_microcents", chType: "UInt64" },
  tokensInput: { column: "tokens_input", chType: "UInt64" },
  tokensOutput: { column: "tokens_output", chType: "UInt64" },
  // OTel status_code: 0 unset, 1 ok, 2 error. Accept the human words and map to the code.
  status: {
    column: "status_code",
    chType: "UInt8",
    mapValue: (v) => (v === "error" ? 2 : v === "ok" ? 1 : v === "unset" ? 0 : v),
  },
}

/** Span filters are row-local — all WHERE clauses, no HAVING (the spans stream doesn't aggregate). */
export const buildSpanFilterClauses = (
  filterSet: FilterSet,
): { whereClauses: string[]; params: Record<string, unknown> } => {
  const { clauses, params } = buildClickHouseWhere(filterSet, SPAN_FIELD_REGISTRY)
  return { whereClauses: clauses, params }
}
