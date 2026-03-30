import type { FilterCondition } from "@domain/shared"
import type { ChFieldRegistry } from "../filter-builder.ts"

const STATUS_TO_INT: Record<string, number> = { unset: 0, ok: 1, error: 2 }

function mapStatusValue(value: FilterCondition["value"]): FilterCondition["value"] {
  if (Array.isArray(value)) {
    return value.map((v) => STATUS_TO_INT[String(v)] ?? -1).filter((n) => n >= 0)
  }
  return STATUS_TO_INT[String(value)] ?? -1
}

export const TRACE_FIELD_REGISTRY: ChFieldRegistry = {
  status: { column: "overall_status", chType: "UInt8", mapValue: mapStatusValue },
  name: { column: "root_span_name", chType: "String" },
  sessionId: { column: "session_id", chType: "String" },
  simulationId: { column: "simulation_id", chType: "String" },
  userId: { column: "user_id", chType: "String" },
  tags: { column: "tags", chType: "String", isArray: true },
  models: { column: "models", chType: "String", isArray: true },
  providers: { column: "providers", chType: "String", isArray: true },
  serviceNames: { column: "service_names", chType: "String", isArray: true },
  cost: { column: "cost_total_microcents", chType: "UInt64" },
  duration: { column: "duration_ns", chType: "Int64" },
  spanCount: { column: "span_count", chType: "UInt64" },
  errorCount: { column: "error_count", chType: "UInt64" },
  tokensInput: { column: "tokens_input", chType: "UInt64" },
  tokensOutput: { column: "tokens_output", chType: "UInt64" },
  startTime: { column: "start_time", chType: "DateTime64(9, 'UTC')" },
}
