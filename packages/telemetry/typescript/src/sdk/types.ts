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
}

export type LatitudeSpanProcessorOptions = SmartFilterOptions & {
  disableRedact?: boolean
  redact?: RedactSpanProcessorOptions
  disableBatch?: boolean
  exporter?: SpanExporter
}

export type { InstrumentationType } from "./instrumentations.ts"
export type { RedactSpanProcessorOptions } from "./redact.ts"
export type { SmartFilterOptions } from "./span-filter.ts"
