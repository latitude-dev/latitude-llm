import type { GenerateTelemetryCapture } from "@domain/ai"
import { type ContextOptions, capture, getLatitudeTracer } from "@latitude-data/telemetry"
import { INVALID_TRACEID, trace } from "@opentelemetry/api"

export { getLatitudeTracer }

const activeTraceId = (): string | undefined => {
  const traceId = trace.getActiveSpan()?.spanContext().traceId
  return traceId === undefined || traceId === INVALID_TRACEID ? undefined : traceId
}

/**
 * Runs an async AI provider call inside Latitude `capture` when `telemetry` is set.
 *
 * `execute` receives the Latitude trace the call is exported into, so a caller can
 * record where a generation ended up. It has to be read here, inside the capture:
 * by the time `runWithAiTelemetry` returns, the capture span has ended and the
 * active span is the host's own trace instead.
 */
export async function runWithAiTelemetry<T>(
  telemetry: GenerateTelemetryCapture | undefined,
  execute: (telemetryTraceId?: string) => Promise<T>,
): Promise<T> {
  if (telemetry === undefined) {
    return execute()
  }

  const { spanName, tags, metadata, ...restOptions } = telemetry
  const options: ContextOptions = {
    ...restOptions,
    ...(tags !== undefined ? { tags: [...tags] } : {}),
    ...(metadata !== undefined ? { metadata: { ...metadata } } : {}),
  }

  return Promise.resolve(capture(spanName, () => execute(activeTraceId()), options))
}
