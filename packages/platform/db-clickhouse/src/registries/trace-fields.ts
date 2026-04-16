import type { TraceFilterFieldName } from "@domain/shared"
import type { ChFieldRegistry } from "../filter-builder.ts"
import { mapDateTime64UtcQueryParam, mapStatusValue } from "./helpers.ts"

type InternalField = "startTime"

export const TRACE_FIELD_REGISTRY: ChFieldRegistry<TraceFilterFieldName | InternalField> = {
  status: { column: "overall_status", chType: "UInt8", mapValue: mapStatusValue },
  name: { column: "root_span_name", chType: "String" },
  traceId: { column: "trace_id", chType: "String" },
  sessionId: { column: "session_id", chType: "String" },
  simulationId: { column: "simulation_id", chType: "String" },
  userId: { column: "user_id", chType: "String" },
  tags: { column: "tags", chType: "String", isArray: true },
  models: { column: "models", chType: "String", isArray: true },
  providers: { column: "providers", chType: "String", isArray: true },
  serviceNames: { column: "service_names", chType: "String", isArray: true },
  duration: { column: "duration_ns", chType: "Int64" },
  ttft: { column: "time_to_first_token_ns", chType: "Int64" },
  cost: { column: "cost_total_microcents", chType: "UInt64" },
  spanCount: { column: "span_count", chType: "UInt64" },
  errorCount: { column: "error_count", chType: "UInt64" },
  tokensInput: { column: "tokens_input", chType: "UInt64" },
  tokensOutput: { column: "tokens_output", chType: "UInt64" },
  startTime: { column: "start_time", chType: "DateTime64(9, 'UTC')", mapValue: mapDateTime64UtcQueryParam },
}
