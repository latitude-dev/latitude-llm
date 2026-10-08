/**
 * Export-time view of a span: redaction plus the SDK's cost, without touching the span.
 *
 * The span object is shared with every other processor on the host provider, so Latitude never
 * writes into it. `ExportViewExporter` hands the inner exporter a Proxy whose `attributes`, `events`
 * and `links` are redacted copies with the SDK's cost written on top. Order:
 *
 * 1. Cost was already resolved at `onEnd` from the unredacted span (`SpanCostTracker`).
 * 2. Redaction masks matching span, event and link attributes.
 * 3. The SDK's cost attributes are written last, so a broad pattern such as `/^gen_ai\./` never
 *    masks a cost the SDK computed. Instrumentor-written cost on spans the SDK doesn't price is
 *    redacted like any other attribute.
 * 4. The inner exporter (e.g. the `service.name` resource override) sees the view.
 */
import type { ExportResult } from "@opentelemetry/core"
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-node"
import { applyCost, type SpanCostTracker } from "./cost.ts"
import { type RedactSpanProcessor, type SpanOverrides, withSpanOverrides } from "./redact.ts"

export class ExportViewExporter implements SpanExporter {
  constructor(
    private readonly inner: SpanExporter,
    private readonly costTracker: SpanCostTracker,
    private readonly redact: RedactSpanProcessor | null,
  ) {}

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    this.inner.export(
      spans.map((span) => this.view(span)),
      resultCallback,
    )
  }

  shutdown(): Promise<void> {
    return this.inner.shutdown()
  }

  forceFlush(): Promise<void> {
    return this.inner.forceFlush?.() ?? Promise.resolve()
  }

  private view(span: ReadableSpan): ReadableSpan {
    // `redactSpan` never throws.
    const overrides: SpanOverrides = this.redact?.redactSpan(span) ?? {}
    try {
      const cost = this.costTracker.costFor(span)
      if (cost) overrides.attributes = applyCost(overrides.attributes ?? span.attributes ?? {}, cost)
    } catch (error) {
      console.warn("[Latitude] Failed to apply LLM cost; exporting span without it", error)
    }
    return withSpanOverrides(span, overrides)
  }
}
