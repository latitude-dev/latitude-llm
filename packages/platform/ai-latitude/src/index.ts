import type { GenerateTelemetryCapture } from "@domain/ai"
import { type ContextOptions, capture, getLatitudeTracer } from "@latitude-data/telemetry"

export { getLatitudeTracer }

/**
 * Runs an async AI provider call inside Latitude `capture` when `telemetry` is set.
 */
export async function runWithAiTelemetry<T>(
  telemetry: GenerateTelemetryCapture | undefined,
  execute: () => Promise<T>,
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

  return Promise.resolve(capture(spanName, execute, options))
}
