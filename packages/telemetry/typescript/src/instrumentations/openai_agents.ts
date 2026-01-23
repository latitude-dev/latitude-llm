import { LifecycleManager, omit, toSnakeCase } from '$telemetry/core'
import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import { ManualInstrumentation } from '$telemetry/instrumentations/manual'
import { ATTRIBUTES, VALUES } from '@latitude-data/constants'
import type * as openaiAgents from '@openai/agents'
import * as otel from '@opentelemetry/api'
import { context, trace } from '@opentelemetry/api'
import { suppressTracing } from '@opentelemetry/core'

const SPAN_KEY = (traceId: string, spanId: string) => `${traceId}:${spanId}`

type openaiAgentsUsage = {
  prompt_tokens: number
  prompt_tokens_details: {
    cached_tokens: number
    audio_tokens: number
  }
  input_tokens: number
  input_tokens_details: {
    cached_tokens: number
  }
  completion_tokens: number
  completion_tokens_details: {
    reasoning_tokens: number
    audio_tokens: number
    accepted_prediction_tokens: number
    rejected_prediction_tokens: number
  }
  output_tokens: number
  output_tokens_details: {
    reasoning_tokens: number
  }
  total_tokens: number
}

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

  private sumUsage(
    a: Partial<openaiAgentsUsage>,
    b: Partial<openaiAgentsUsage>,
  ) {
    return {
      prompt_tokens: (a.prompt_tokens ?? 0) + (b.prompt_tokens ?? 0),
      prompt_tokens_details: {
        cached_tokens:
          (a.prompt_tokens_details?.cached_tokens ?? 0) +
          (b.prompt_tokens_details?.cached_tokens ?? 0),
        audio_tokens:
          (a.prompt_tokens_details?.audio_tokens ?? 0) +
          (b.prompt_tokens_details?.audio_tokens ?? 0),
      },
      input_tokens: (a.input_tokens ?? 0) + (b.input_tokens ?? 0),
      input_tokens_details: {
        cached_tokens:
          (a.input_tokens_details?.cached_tokens ?? 0) +
          (b.input_tokens_details?.cached_tokens ?? 0),
      },
      completion_tokens:
        (a.completion_tokens ?? 0) + (b.completion_tokens ?? 0),
      completion_tokens_details: {
        reasoning_tokens:
          (a.completion_tokens_details?.reasoning_tokens ?? 0) +
          (b.completion_tokens_details?.reasoning_tokens ?? 0),
        audio_tokens:
          (a.completion_tokens_details?.audio_tokens ?? 0) +
          (b.completion_tokens_details?.audio_tokens ?? 0),
        accepted_prediction_tokens:
          (a.completion_tokens_details?.accepted_prediction_tokens ?? 0) +
          (b.completion_tokens_details?.accepted_prediction_tokens ?? 0),
        rejected_prediction_tokens:
          (a.completion_tokens_details?.rejected_prediction_tokens ?? 0) +
          (b.completion_tokens_details?.rejected_prediction_tokens ?? 0),
      },
      output_tokens: (a.output_tokens ?? 0) + (b.output_tokens ?? 0),
      output_tokens_details: {
        reasoning_tokens:
          (a.output_tokens_details?.reasoning_tokens ?? 0) +
          (b.output_tokens_details?.reasoning_tokens ?? 0),
      },
      total_tokens: (a.total_tokens ?? 0) + (b.total_tokens ?? 0),
    }
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
    _data: openaiAgents.ResponseSpanData,
  ) {
    // Note: response spans do not include any info on start...
    return this.manualTelemetry.completion(ctx, {
      provider: 'openai',
      model: 'unknown',
      configuration: {},
      input: [],
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
    let usage = {} as openaiAgentsUsage
    if (data.usage) usage = this.sumUsage(usage, data.usage)
    let finishReason =
      VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.unknown
    const output: Record<string, unknown>[] = []

    for (const item of data.output ?? []) {
      if ('choices' in item && Array.isArray(item.choices)) {
        if ('message' in item.choices[0]) {
          output.push(item.choices[0].message)
        }

        if ('finish_reason' in item.choices[0]) {
          finishReason = item.choices[0].finish_reason ?? finishReason
        }
      }

      if ('usage' in item) {
        usage = this.sumUsage(usage, item.usage)
      }
    }

    end({
      output: output,
      tokens: {
        prompt: usage.prompt_tokens + usage.input_tokens,
        cached:
          usage.prompt_tokens_details.cached_tokens +
          usage.input_tokens_details.cached_tokens,
        reasoning:
          usage.completion_tokens_details.reasoning_tokens +
          usage.output_tokens_details.reasoning_tokens,
        completion: usage.completion_tokens + usage.output_tokens,
      },
      finishReason: finishReason,
    })
  }

  private onResponseSpanEnd(
    end: ReturnType<ManualInstrumentation['completion']>['end'],
    data: openaiAgents.ResponseSpanData,
  ) {
    // Note: response spans do not include any info on start
    // So, we will try to enrich the input attributes now
    let name!: string
    let attributes!: otel.Attributes
    context.with(suppressTracing(context.active()), () => {
      let model = 'unknown'
      let configuration = {}
      let input: Record<string, unknown>[] = []

      if (data._response) {
        configuration = omit(data._response, [
          'id',
          'object',
          'created_at',
          'status',
          'billing',
          'completed_at',
          'error',
          'incomplete_details',
          'output',
          'previous_response_id',
          'usage',
          'user',
          'metadata',
          'output_text',
        ])

        if ('model' in data._response) {
          model = data._response.model
        }
      }

      if (typeof data._input === 'string') {
        input.push({ role: 'user', content: data._input })
      } else {
        for (const item of data._input ?? []) {
          if ('role' in item) {
            input.push(item)
          } else if ('type' in item && item.type === 'function_call_result') {
            input.push({ role: 'tool', content: [item] })
          } else {
            input.push({ role: 'assistant', content: [item] })
          }
        }
      }

      const span = this.manualTelemetry.completion(context.active(), {
        provider: 'openai',
        model: model,
        configuration: configuration,
        input: input,
      })

      name = span.__name
      attributes = span.__attributes
    })

    let usage = {} as openaiAgentsUsage
    let finishReason =
      VALUES.OPENTELEMETRY.GEN_AI.response.finishReasons.unknown
    let output: Record<string, unknown>[] = []

    if (data._response) {
      if ('output' in data._response) {
        output = [{ role: 'assistant', content: data._response.output ?? [] }]
      }

      if ('usage' in data._response) {
        usage = this.sumUsage(usage, data._response.usage)
      }

      if ('finish_reason' in data._response) {
        finishReason = data._response.finish_reason ?? finishReason
      }
    }

    end({
      name: name,
      attributes: attributes,
      output: output,
      tokens: {
        prompt: usage.prompt_tokens + usage.input_tokens,
        cached:
          usage.prompt_tokens_details.cached_tokens +
          usage.input_tokens_details.cached_tokens,
        reasoning:
          usage.completion_tokens_details.reasoning_tokens +
          usage.output_tokens_details.reasoning_tokens,
        completion: usage.completion_tokens + usage.output_tokens,
      },
      finishReason: finishReason,
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
