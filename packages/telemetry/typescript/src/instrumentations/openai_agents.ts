import { LifecycleManager, toSnakeCase } from '$telemetry/core'
import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import { ManualInstrumentation } from '$telemetry/instrumentations/manual'
import { ATTRIBUTES, VALUES } from '@latitude-data/constants'
import type * as openaiAgents from '@openai/agents'
import * as otel from '@opentelemetry/api'
import { context, trace } from '@opentelemetry/api'

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

  private attribifyData(data: Record<string, unknown>) {
    const attributes: otel.Attributes = {}

    for (const [key, value] of Object.entries(data)) {
      if (!value) continue

      const attribute = `${ATTRIBUTES.OPENAI_AGENTS._root}.${toSnakeCase(key)}`
      attributes[attribute] =
        typeof value !== 'string' ? JSON.stringify(value) : value
    }

    return attributes
  }

  private onAgentSpanStart(
    ctx: otel.Context,
    data: openaiAgents.AgentSpanData,
  ) {
    return this.manualTelemetry.unknown(ctx, {
      name: data.name,
    })
  }

  private onFunctionSpanStart(
    ctx: otel.Context,
    data: openaiAgents.FunctionSpanData,
  ) {
    let dictArguments = {}
    try {
      dictArguments = JSON.parse(data.input)
    } catch (error) {
      dictArguments = {}
    }

    return this.manualTelemetry.tool(ctx, {
      name: data.name,
      call: {
        id: data.name,
        arguments: dictArguments,
      },
    })
  }

  // Note: Generation spans only appear using the OpenAI Chat Completions API
  private onGenerationSpanStart(
    ctx: otel.Context,
    data: openaiAgents.GenerationSpanData,
  ) {
    return this.manualTelemetry.completion(ctx, {
      provider: 'openai',
      model: data.model ?? 'unknown',
      configuration: data.model_config,
      input: data.input,
    })
  }

  // Note: Response spans only appear using the OpenAI Responses API
  private onResponseSpanStart(
    ctx: otel.Context,
    data: openaiAgents.ResponseSpanData,
  ) {
    return this.manualTelemetry.completion(ctx, {
      provider: 'openai',
      model: undefined, // TODO(oaiagents): implement
      configuration: undefined, // TODO(oaiagents): implement
      input: undefined, // TODO(oaiagents): implement
    })
  }

  private onCustomSpanStart(
    ctx: otel.Context,
    data: openaiAgents.CustomSpanData,
  ) {
    return this.manualTelemetry.unknown(ctx, {
      name: data.name,
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
      case 'function':
        current = this.onFunctionSpanStart(ctx, span.spanData)
        break
      case 'generation':
        current = this.onGenerationSpanStart(ctx, span.spanData)
        break
      case 'response':
        current = this.onResponseSpanStart(ctx, span.spanData)
        break
      case 'custom':
        current = this.onCustomSpanStart(ctx, span.spanData)
        break
      default:
        current = this.onUnknownSpanStart(ctx, span.spanData)
        break
    }

    const attributes = this.attribifyData(span.spanData)
    trace.getSpan(current.context)?.setAttributes(attributes)

    this.spans[SPAN_KEY(span.traceId, span.spanId)] = current as ReturnType<ManualInstrumentation['span']> // prettier-ignore
  }

  private onAgentSpanEnd(
    end: ReturnType<ManualInstrumentation['unknown']>['end'],
    _data: openaiAgents.AgentSpanData,
  ) {
    end()
  }

  private onFunctionSpanEnd(
    end: ReturnType<ManualInstrumentation['tool']>['end'],
    data: openaiAgents.FunctionSpanData,
  ) {
    end({
      result: {
        value: data.output,
        isError: false,
      },
    })
  }

  private onGenerationSpanEnd(
    end: ReturnType<ManualInstrumentation['completion']>['end'],
    data: openaiAgents.GenerationSpanData,
  ) {
    const finishReason =
      VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.unknown

    end({
      output: undefined, // TODO(oaiagents): implement
      tokens: {
        prompt: 0, // TODO(oaiagents): implement
        cached: 0, // TODO(oaiagents): implement
        reasoning: 0, // TODO(oaiagents): implement
        completion: 0, // TODO(oaiagents): implement
      },
      finishReason: undefined, // TODO(oaiagents): implement
    })
  }

  private onResponseSpanEnd(
    end: ReturnType<ManualInstrumentation['completion']>['end'],
    data: openaiAgents.ResponseSpanData,
  ) {
    const finishReason =
      VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.unknown

    end({
      output: undefined, // TODO(oaiagents): implement
      tokens: {
        prompt: 0, // TODO(oaiagents): implement
        cached: 0, // TODO(oaiagents): implement
        reasoning: 0, // TODO(oaiagents): implement
        completion: 0, // TODO(oaiagents): implement
      },
      finishReason: undefined, // TODO(oaiagents): implement
    })
  }

  private onCustomSpanEnd(
    end: ReturnType<ManualInstrumentation['unknown']>['end'],
    _data: openaiAgents.CustomSpanData,
  ) {
    end()
  }

  private onUnknownSpanEnd(
    end: ReturnType<ManualInstrumentation['unknown']>['end'],
    _data: openaiAgents.SpanData,
  ) {
    end()
  }

  async onSpanEnd(
    span: openaiAgents.Span<openaiAgents.SpanData>,
  ): Promise<void> {
    const key = SPAN_KEY(span.traceId, span.spanId)

    const current = this.spans[key]
    if (!current) return

    const attributes = this.attribifyData(span.spanData)
    trace.getSpan(current.context)?.setAttributes(attributes)

    if (span.error) {
      current.fail(new Error(span.error.message), {
        attributes: {
          [ATTRIBUTES.OPENAI_AGENTS.error.message]: span.error.message,
          ...(span.error.data && {
            [ATTRIBUTES.OPENAI_AGENTS.error.details]: JSON.stringify(span.error.data), // prettier-ignore
          }),
        },
      })
      delete this.spans[key]
      return
    }

    switch (span.spanData.type) {
      case 'agent':
        this.onAgentSpanEnd(current.end, span.spanData)
        break
      case 'function':
        this.onFunctionSpanEnd(current.end, span.spanData)
        break
      case 'generation':
        this.onGenerationSpanEnd(current.end, span.spanData)
        break
      case 'response':
        this.onResponseSpanEnd(current.end, span.spanData)
        break
      case 'custom':
        this.onCustomSpanEnd(current.end, span.spanData)
        break
      default:
        this.onUnknownSpanEnd(current.end, span.spanData)
        break
    }

    delete this.spans[key]
  }
}
