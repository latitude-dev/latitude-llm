import type { TracerProvider } from "@opentelemetry/api"
import type { SpanExporter } from "@opentelemetry/sdk-trace-node"
import type { InstrumentationsInput } from "./instrumentations.ts"
import type { RedactSpanProcessorOptions } from "./redact.ts"
import type { SmartFilterOptions } from "./span-filter.ts"

export type ContextOptions = {
  name?: string
  tags?: string[]
  metadata?: Record<string, unknown>
  sessionId?: string
  userId?: string
  /**
   * Route the capture (and all child spans) to a specific Latitude project.
   *
   * Overrides the constructor `project` default for this capture only. Useful when one
   * process emits to multiple projects (e.g. multiple agents in the same service).
   */
  project?: string
  /**
   * @deprecated Renamed to `project`. Still accepted for backwards compatibility and will be
   * removed in a future release. When both are set, `project` wins.
   */
  projectSlug?: string
}

export type LatitudeOptions = SmartFilterOptions & {
  apiKey: string
  /**
   * Default project for spans emitted by this SDK instance.
   *
   * Optional — when omitted, every `capture()` call MUST set its own `project` (or rely on
   * an OTEL resource attribute / per-span attribute). When set, the SDK forwards it as the
   * `X-Latitude-Project` header so spans without a per-span override land in this project.
   *
   * Precedence on the server (highest first): span attribute `latitude.project` →
   * OTEL resource attribute `latitude.project` → `X-Latitude-Project` header.
   */
  project?: string
  /**
   * @deprecated Renamed to `project`. Still accepted for backwards compatibility and will be
   * removed in a future release. When both are set, `project` wins.
   */
  projectSlug?: string
  /**
   * Map of integration name → LLM SDK module reference the user imports in app code.
   * Example: `{ openai: OpenAI, anthropic: AnthropicSDK }`. The patch lands on the same
   * prototype the consumer's code calls.
   */
  instrumentations?: InstrumentationsInput
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
  /**
   * Sets the OpenTelemetry `service.name` resource attribute on the Latitude-owned provider.
   * Honored only when `new Latitude()` creates its own provider. When piggy-backing on an
   * existing provider (via `tracerProvider` or the detected global), this option is ignored
   * and the host provider's `service.name` is used — overriding the host's resource would
   * silently relabel spans the host SDK also processes.
   */
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
  /**
   * Overrides the `service.name` resource attribute on spans exported through this processor.
   * Applied via an exporter wrapper, so other span processors on the host provider continue
   * to see the host's original resource.
   */
  serviceName?: string
}

export type { RedactSpanProcessorOptions } from "./redact.ts"
export type { SmartFilterOptions } from "./span-filter.ts"
