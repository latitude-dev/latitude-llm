import * as otel from "@opentelemetry/api"
import { propagation, trace } from "@opentelemetry/api"
import type { BaseInstrumentation } from "./base.ts"

export type CaptureOptions = {
  tags?: string[]
  metadata?: Record<string, unknown>
  sessionId?: string
  userId?: string
}

export class ManualInstrumentation implements BaseInstrumentation {
  private enabled: boolean
  private readonly _tracer: otel.Tracer

  constructor(tracer: otel.Tracer) {
    this.enabled = false
    this._tracer = tracer
  }

  get tracer(): otel.Tracer {
    return this._tracer
  }

  isEnabled() {
    return this.enabled
  }

  enable() {
    this.enabled = true
  }

  disable() {
    this.enabled = false
  }

  resume(ctx: { traceparent: string; baggage?: string }): otel.Context {
    const parts = ctx.traceparent.split("-")
    if (parts.length !== 4) {
      return otel.ROOT_CONTEXT
    }

    const [, traceId, spanId, flags] = parts
    if (!traceId || !spanId) {
      return otel.ROOT_CONTEXT
    }

    const spanContext: otel.SpanContext = {
      traceId,
      spanId,
      traceFlags: parseInt(flags ?? "01", 16),
      isRemote: true,
    }

    let context = trace.setSpanContext(otel.ROOT_CONTEXT, spanContext)

    if (ctx.baggage) {
      const baggageEntries: Record<string, otel.BaggageEntry> = {}
      for (const pair of ctx.baggage.split(",")) {
        const [key, value] = pair.split("=", 2)
        if (key && value) {
          baggageEntries[decodeURIComponent(key)] = { value: decodeURIComponent(value) }
        }
      }
      const baggage = propagation.createBaggage(baggageEntries)
      context = propagation.setBaggage(context, baggage)
    }

    return context
  }
}
