import { LifecycleManager } from '$telemetry/core'
import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import { ManualInstrumentation } from '$telemetry/instrumentations/manual'
import type * as openaiAgents from '@openai/agents'
import * as otel from '@opentelemetry/api'
import { context } from '@opentelemetry/api'

const SPAN_KEY = (traceId: string, spanId: string) => `${traceId}:${spanId}`

export type OpenAIAgentsInstrumentationOptions = {
  module: typeof openaiAgents
}

export class OpenAIAgentsInstrumentation implements BaseInstrumentation {
  private readonly options: OpenAIAgentsInstrumentationOptions
  private readonly manualTelemetry: ManualInstrumentation
  private readonly lifecycle: LifecycleManager
  private instrumented: boolean
  private spans: Record<string, ReturnType<ManualInstrumentation['span']>>

  constructor(
    tracer: otel.Tracer,
    lifecycle: LifecycleManager,
    options: OpenAIAgentsInstrumentationOptions,
  ) {
    this.manualTelemetry = new ManualInstrumentation(tracer)
    this.lifecycle = lifecycle
    this.options = options
    this.instrumented = false
    this.spans = {}
  }

  isEnabled() {
    return this.manualTelemetry.isEnabled()
  }

  enable() {
    this.manualTelemetry.enable()
    if (!this.instrumented) {
      this.instrumented = true
      this.options.module.addTraceProcessor(this)
    }
  }

  disable() {
    this.manualTelemetry.disable()
    this.spans = {}
    // Note: OpenAI Agents does not have a way to uninstrument a trace processor
  }

  start(): void {
    /* No-op */
  }

  async shutdown(_timeout?: number): Promise<void> {
    await this.lifecycle.shutdown()
  }

  async forceFlush(): Promise<void> {
    await this.lifecycle.flush()
  }

  async onTraceStart(_trace: openaiAgents.Trace): Promise<void> {
    /* No-op */
  }

  async onTraceEnd(_trace: openaiAgents.Trace): Promise<void> {
    /* No-op */
  }

  private onAgentSpanStart(
    ctx: otel.Context,
    data: openaiAgents.AgentSpanData,
  ) {
    return this.manualTelemetry.unknown(ctx, {
      name: data.type,
    })
  }

  private onUnknownSpanStart(ctx: otel.Context, data: openaiAgents.SpanData) {
    return this.manualTelemetry.unknown(ctx, {
      name: data.type,
    })
  }

  async onSpanStart(
    span: openaiAgents.Span<openaiAgents.SpanData>,
  ): Promise<void> {
    let parent
    if (span.parentId) {
      parent = this.spans[SPAN_KEY(span.traceId, span.parentId)]
    }
    const ctx = parent?.context ?? context.active()

    let current
    switch (span.spanData.type) {
      case 'agent':
        current = this.onAgentSpanStart(ctx, span.spanData)
        break
      default:
        current = this.onUnknownSpanStart(ctx, span.spanData)
        break
    }

    this.spans[SPAN_KEY(span.traceId, span.spanId)] = current
  }

  private onAgentSpanEnd(
    end: ReturnType<ManualInstrumentation['unknown']>['end'],
    data: openaiAgents.AgentSpanData,
  ) {
    // TODO(oaiagents): implement
    end()
  }

  private onUnknownSpanEnd(
    end: ReturnType<ManualInstrumentation['unknown']>['end'],
    data: openaiAgents.SpanData,
  ) {
    // TODO(oaiagents): implement
    end()
  }

  async onSpanEnd(
    span: openaiAgents.Span<openaiAgents.SpanData>,
  ): Promise<void> {
    const key = SPAN_KEY(span.traceId, span.spanId)

    const current = this.spans[key]
    if (!current) return

    if (span.error) {
      // TODO(oaiagents): add attributes to store span.error.data if any
      current.fail(new Error(span.error.message))
      delete this.spans[key]
      return
    }

    switch (span.spanData.type) {
      case 'agent':
        this.onAgentSpanEnd(current.end, span.spanData)
        break
      default:
        this.onUnknownSpanEnd(current.end, span.spanData)
        break
    }

    delete this.spans[key]
  }
}
