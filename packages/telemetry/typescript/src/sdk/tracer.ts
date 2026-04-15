import { trace, type Tracer } from "@opentelemetry/api"
import { SCOPE_LATITUDE } from "../constants/scope.ts"

/**
 * Returns an OpenTelemetry tracer scoped under Latitude's instrumentation namespace.
 * Spans created with this tracer pass the LatitudeSpanProcessor's smart filter.
 */
export function getLatitudeTracer(scope: string): Tracer {
  return trace.getTracer(`${SCOPE_LATITUDE}.${scope}`)
}
