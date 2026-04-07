import type { ChFieldRegistry } from "../filter-builder.ts"
import { mapDateTime64UtcQueryParam } from "./helpers.ts"

export const SESSION_FIELD_REGISTRY: ChFieldRegistry = {
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
  traceCount: { column: "trace_count", chType: "UInt64" },
  tokensInput: { column: "tokens_input", chType: "UInt64" },
  tokensOutput: { column: "tokens_output", chType: "UInt64" },
  startTime: { column: "start_time", chType: "DateTime64(9, 'UTC')", mapValue: mapDateTime64UtcQueryParam },
}
