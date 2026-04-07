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

export type InitLatitudeOptions = SmartFilterOptions & {
  apiKey: string
  projectSlug: string
  instrumentations?: InstrumentationType[]
  disableRedact?: boolean
  redact?: RedactSpanProcessorOptions
  disableBatch?: boolean
  exporter?: SpanExporter
  /** Sets `service.name` on exported spans (and on the provider resource when using `initLatitude`). */
  serviceName?: string
}

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
