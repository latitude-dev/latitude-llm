import type { TracerProvider } from "@opentelemetry/api"
import type { SpanExporter } from "@opentelemetry/sdk-trace-node"
import type { InstrumentationType } from "./instrumentations.ts"
import type { RedactSpanProcessorOptions } from "./redact.ts"
import type { SmartFilterOptions } from "./span-filter.ts"

export type ContextOptions = {
  name?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  sessionId?: string
  userId?: string
}

export type LatitudeOptions = SmartFilterOptions & {
  apiKey: string
  projectSlug: string
  instrumentations?: InstrumentationType[]
  disableRedact?: boolean
  redact?: RedactSpanProcessorOptions
  disableBatch?: boolean
  exporter?: SpanExporter
  /**
   * Existing OpenTelemetry tracer provider to attach Latitude to.
   * Usually omitted because `new Latitude()` detects the global provider installed by Sentry,
   * Datadog, New Relic, Honeycomb, or a custom OTel SDK setup.
   */
  tracerProvider?: TracerProvider
  /** Sets `service.name` on exported spans (and on the provider resource when using `new Latitude()`). */
  serviceName?: string
}

/**
 * @deprecated Use `LatitudeOptions` with `new Latitude(options)` instead.
 */
export type InitLatitudeOptions = LatitudeOptions

export type LatitudeSpanProcessorOptions = SmartFilterOptions & {
  disableRedact?: boolean
  redact?: RedactSpanProcessorOptions
  disableBatch?: boolean
  exporter?: SpanExporter
  /** Sets `service.name` on each span so Latitude ingest can attribute telemetry to your service. */
  serviceName?: string
}

export type { InstrumentationType } from "./instrumentations.ts"
export type { RedactSpanProcessorOptions } from "./redact.ts"
export type { SmartFilterOptions } from "./span-filter.ts"
