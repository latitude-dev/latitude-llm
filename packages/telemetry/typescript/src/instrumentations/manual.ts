import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import { toKebabCase, toSnakeCase } from '$telemetry/utils'
import {
  ATTRIBUTES,
  SPAN_SPECIFICATIONS,
  SpanType,
  TraceContext,
  VALUES,
} from '@latitude-data/constants'
import * as otel from '@opentelemetry/api'
import { propagation, trace } from '@opentelemetry/api'
import { Provider, Translator } from 'rosetta-ai'

const translator = new Translator({
  filterEmptyMessages: true,
  providerMetadata: 'preserve',
})

export type StartSpanOptions = {
  name?: string
  attributes?: otel.Attributes
}

export type EndSpanOptions = {
  attributes?: otel.Attributes
}

export type ErrorOptions = {
  attributes?: otel.Attributes
}

export type StartToolSpanOptions = {
  name: string
  call: {
    id: string
    arguments: Record<string, unknown>
  }
  attributes?: otel.Attributes
}

export type EndToolSpanOptions = EndSpanOptions & {
  result: {
    value: unknown
    isError: boolean
  }
}

export type StartCompletionSpanOptions = {
  name?: string
  provider: string
  model: string
  configuration?: Record<string, unknown>
  input?: string | Record<string, unknown>[]
  attributes?: otel.Attributes
}

export type EndCompletionSpanOptions = EndSpanOptions & {
  output?: string | Record<string, unknown>[]
  tokens?: {
    prompt?: number
    cached?: number
    reasoning?: number
    completion?: number
  }
  finishReason?: string
}

export type StartHttpSpanOptions = {
  name?: string
  request: {
    method: string
    url: string
    headers: Record<string, string>
    body: string | Record<string, unknown>
  }
  attributes?: otel.Attributes
}

export type EndHttpSpanOptions = EndSpanOptions & {
  response: {
    status: number
    headers: Record<string, string>
    body: string | Record<string, unknown>
  }
}

export type PromptSpanOptions = {
  name?: string
  template: string
  parameters?: Record<string, unknown>
  attributes?: otel.Attributes
}

export type ChatSpanOptions = {
  name?: string
  attributes?: otel.Attributes
}

export type ExternalSpanOptions = {
  name?: string
  externalId?: string
  attributes?: otel.Attributes
}

export type CaptureOptions = {
  name?: string
  path: string // The document path
  projectId: number
  versionUuid?: string // Optional, defaults to HEAD commit
  conversationUuid?: string // Optional, if provided, will be used as the documentLogUuid
  attributes?: otel.Attributes
}

export type ManualInstrumentationOptions = {
  provider?: Provider
}

export class ManualInstrumentation implements BaseInstrumentation {
  private enabled: boolean
  private readonly tracer: otel.Tracer
  private readonly options: ManualInstrumentationOptions

  constructor(tracer: otel.Tracer, options?: ManualInstrumentationOptions) {
    this.enabled = false
    this.tracer = tracer
    this.options = options ?? {}
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

  resume(ctx: TraceContext): otel.Context {
    const parts = ctx.traceparent.split('-')
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
      traceFlags: parseInt(flags ?? '01', 16),
      isRemote: true,
    }

    let context = trace.setSpanContext(otel.ROOT_CONTEXT, spanContext)

    if (ctx.baggage) {
      const baggageEntries: Record<string, otel.BaggageEntry> = {}
      for (const pair of ctx.baggage.split(',')) {
        const [key, value] = pair.split('=')
        if (key && value) {
          baggageEntries[key] = { value: decodeURIComponent(value) }
        }
      }
      const baggage = propagation.createBaggage(baggageEntries)
      context = propagation.setBaggage(context, baggage)
    }

    return context
  }

  private error(span: otel.Span, error: Error, options?: ErrorOptions) {
    options = options || {}

    span.recordException(error)
    span.setAttributes(options.attributes || {})
    span.setStatus({
      code: otel.SpanStatusCode.ERROR,
      message: error.message || undefined,
    })
    span.end()
  }

  private span<T extends SpanType>(
    ctx: otel.Context,
    name: string,
    type: T,
    options?: StartSpanOptions,
  ) {
    if (!this.enabled) {
      return {
        context: ctx,
        end: (_options?: EndSpanOptions) => {},
        fail: (_error: Error, _options?: ErrorOptions) => {},
      }
    }

    const start = options || {}

    let operation = undefined
    if (SPAN_SPECIFICATIONS[type].isGenAI) {
      operation = type
    }

    const span = this.tracer.startSpan(
      name,
      {
        attributes: {
          [ATTRIBUTES.LATITUDE.type]: type,
          ...(operation && {
            [ATTRIBUTES.OPENTELEMETRY.GEN_AI.operation]: operation,
          }),
          ...(start.attributes || {}),
        },
        kind: otel.SpanKind.CLIENT,
      },
      ctx,
    )

    const newCtx = trace.setSpan(ctx, span)

    return {
      context: newCtx,
      end: (options?: EndSpanOptions) => {
        const end = options || {}

        span.setAttributes(end.attributes || {})
        span.setStatus({ code: otel.SpanStatusCode.OK })
        span.end()
      },
      fail: (error: Error, options?: ErrorOptions) => {
        this.error(span, error, options)
      },
    }
  }

  unknown(ctx: otel.Context, options?: StartSpanOptions) {
    return this.span(
      ctx,
      options?.name || SPAN_SPECIFICATIONS[SpanType.Unknown].name,
      SpanType.Unknown,
      options,
    )
  }

  tool(ctx: otel.Context, options: StartToolSpanOptions) {
    const start = options

    let jsonArguments = ''
    try {
      jsonArguments = JSON.stringify(start.call.arguments)
    } catch (_error) {
      jsonArguments = '{}'
    }

    const span = this.span(ctx, start.name, SpanType.Tool, {
      ...start,
      attributes: {
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.name]: start.name,
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.type]:
          VALUES.OPENTELEMETRY.GEN_AI.tool.type.function,
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.call.id]: start.call.id,
        [ATTRIBUTES.OPENTELEMETRY.GEN_AI.tool.call.arguments]: jsonArguments,
        ...(start.attributes || {}),
      },
    })

    return {
      ...span,
      end: (options: EndToolSpanOptions) => {
        const end = options

        let stringResult = ''
        if (typeof end.result.value !== 'string') {
          try {
            stringResult = JSON.stringify(end.result.value)
          } catch (_error) {
            stringResult = '{}'
          }
        } else {
          stringResult = end.result.value
        }

        span.end({
          attributes: {
            [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.result.value]:
              stringResult,
            [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.tool.result.isError]:
              end.result.isError,
            ...(end.attributes || {}),
          },
        })
      },
    }
  }

  private attribifyConfiguration(
    direction: 'input' | 'output',
    configuration: Record<string, unknown>,
  ) {
    const prefix =
      direction === 'input'
        ? ATTRIBUTES.LATITUDE.request._root
        : ATTRIBUTES.LATITUDE.response._root

    const attributes: otel.Attributes = {}
    for (const key in configuration) {
      const field = toSnakeCase(key)
      let value = configuration[key]
      if (value === null || value === undefined) continue
      if (typeof value === 'object' && !Array.isArray(value)) {
        try {
          value = JSON.stringify(value)
        } catch (_error) {
          value = '{}'
        }
      }

      attributes[`${prefix}.${field}`] = value as any
    }

    return attributes
  }

  completion(ctx: otel.Context, options: StartCompletionSpanOptions) {
    const start = options

    const configuration = {
      ...(start.configuration ?? {}),
      model: start.model,
    }
    let jsonConfiguration = ''
    try {
      jsonConfiguration = JSON.stringify(configuration)
    } catch (_error) {
      jsonConfiguration = '{}'
    }
    const attrConfiguration = this.attribifyConfiguration(
      'input',
      configuration,
    )

    const input = start.input ?? []
    let jsonSystem = ''
    let jsonInput = ''
    try {
      const translated = translator.translate(input, {
        from: this.options.provider,
        to: Provider.GenAI,
        direction: 'input',
      })
      jsonSystem = JSON.stringify(translated.system ?? [])
      jsonInput = JSON.stringify(translated.messages ?? [])
    } catch (_error) {
      jsonSystem = '[]'
      jsonInput = '[]'
    }

    const span = this.span(
      ctx,
      start.name || `${start.provider} / ${start.model}`,
      SpanType.Completion,
      {
        ...start,
        attributes: {
          [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.system]: start.provider,
          [ATTRIBUTES.LATITUDE.request.configuration]: jsonConfiguration,
          ...attrConfiguration,
          [ATTRIBUTES.OPENTELEMETRY.GEN_AI.systemInstructions]: jsonSystem,
          [ATTRIBUTES.OPENTELEMETRY.GEN_AI.input.messages]: jsonInput,
          ...(start.attributes || {}),
        },
      },
    )

    return {
      ...span,
      end: (options?: EndCompletionSpanOptions) => {
        const end = options ?? {}

        const output = end.output ?? []
        let jsonOutput = ''
        try {
          const translated = translator.translate(output, {
            from: this.options.provider,
            to: Provider.GenAI,
            direction: 'output',
          })
          jsonOutput = JSON.stringify(translated.messages ?? [])
        } catch (_error) {
          jsonOutput = '[]'
        }

        const tokens = {
          prompt: end.tokens?.prompt ?? 0,
          cached: end.tokens?.cached ?? 0,
          reasoning: end.tokens?.reasoning ?? 0,
          completion: end.tokens?.completion ?? 0,
        }
        const inputTokens = tokens.prompt + tokens.cached
        const outputTokens = tokens.reasoning + tokens.completion
        const finishReason = end.finishReason ?? ''

        span.end({
          attributes: {
            [ATTRIBUTES.OPENTELEMETRY.GEN_AI.output.messages]: jsonOutput,
            [ATTRIBUTES.OPENTELEMETRY.GEN_AI.usage.inputTokens]: inputTokens,
            [ATTRIBUTES.OPENTELEMETRY.GEN_AI.usage.outputTokens]: outputTokens,
            [ATTRIBUTES.LATITUDE.usage.promptTokens]: tokens.prompt,
            [ATTRIBUTES.LATITUDE.usage.cachedTokens]: tokens.cached,
            [ATTRIBUTES.LATITUDE.usage.reasoningTokens]: tokens.reasoning,
            [ATTRIBUTES.LATITUDE.usage.completionTokens]: tokens.completion,
            [ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.model]: start.model,
            [ATTRIBUTES.OPENTELEMETRY.GEN_AI.response.finishReasons]: [
              finishReason,
            ],
            ...(end.attributes || {}),
          },
        })
      },
    }
  }

  embedding(ctx: otel.Context, options?: StartSpanOptions) {
    return this.span(
      ctx,
      options?.name || SPAN_SPECIFICATIONS[SpanType.Embedding].name,
      SpanType.Embedding,
      options,
    )
  }

  private attribifyHeaders(
    direction: 'request' | 'response',
    headers: Record<string, string>,
  ) {
    const prefix =
      direction === 'request'
        ? ATTRIBUTES.OPENTELEMETRY.HTTP.request.header
        : ATTRIBUTES.OPENTELEMETRY.HTTP.response.header

    const attributes: otel.Attributes = {}
    for (const key in headers) {
      const field = toKebabCase(key)
      const value = headers[key]
      if (value === null || value === undefined) continue

      attributes[`${prefix}.${field}`] = value as any
    }

    return attributes
  }

  http(ctx: otel.Context, options: StartHttpSpanOptions) {
    const start = options

    const method = start.request.method.toUpperCase()

    // Note: do not serialize headers as a single attribute because fields won't be redacted
    const attrHeaders = this.attribifyHeaders('request', start.request.headers)

    let finalBody = ''
    if (typeof start.request.body === 'string') {
      finalBody = start.request.body
    } else {
      try {
        finalBody = JSON.stringify(start.request.body)
      } catch (_error) {
        finalBody = '{}'
      }
    }

    const span = this.span(
      ctx,
      start.name || `${method} ${start.request.url}`,
      SpanType.Http,
      {
        ...start,
        attributes: {
          [ATTRIBUTES.OPENTELEMETRY.HTTP.request.method]: method,
          [ATTRIBUTES.OPENTELEMETRY.HTTP.request.url]: start.request.url,
          ...attrHeaders,
          [ATTRIBUTES.OPENTELEMETRY.HTTP.request.body]: finalBody,
          ...(start.attributes || {}),
        },
      },
    )

    return {
      ...span,
      end: (options: EndHttpSpanOptions) => {
        const end = options

        // Note: do not serialize headers as a single attribute because fields won't be redacted
        const attrHeaders = this.attribifyHeaders(
          'response',
          end.response.headers,
        )

        let finalBody = ''
        if (typeof end.response.body === 'string') {
          finalBody = end.response.body
        } else {
          try {
            finalBody = JSON.stringify(end.response.body)
          } catch (_error) {
            finalBody = '{}'
          }
        }

        span.end({
          attributes: {
            [ATTRIBUTES.OPENTELEMETRY.HTTP.response.statusCode]:
              end.response.status,
            ...attrHeaders,
            [ATTRIBUTES.OPENTELEMETRY.HTTP.response.body]: finalBody,
            ...(end.attributes || {}),
          },
        })
      },
    }
  }

  prompt(ctx: otel.Context, options: PromptSpanOptions) {
    const { template, parameters, name, attributes: userAttributes } = options

    let jsonParameters = ''
    try {
      jsonParameters = JSON.stringify(parameters || {})
    } catch (_error) {
      jsonParameters = '{}'
    }

    const attributes = {
      [ATTRIBUTES.LATITUDE.request.template]: template,
      [ATTRIBUTES.LATITUDE.request.parameters]: jsonParameters,
      ...(userAttributes || {}),
    }

    return this.span(ctx, name || 'prompt', SpanType.Prompt, { attributes })
  }

  chat(ctx: otel.Context, options: ChatSpanOptions) {
    const { name, attributes: userAttributes } = options

    const attributes = {
      ...(userAttributes || {}),
    }

    return this.span(ctx, name || 'chat', SpanType.Chat, { attributes })
  }

  external(ctx: otel.Context, options: ExternalSpanOptions) {
    const { externalId, name, attributes: userAttributes } = options

    const attributes = {
      ...(externalId && { [ATTRIBUTES.LATITUDE.externalId]: externalId }),
      ...(userAttributes || {}),
    }

    return this.span(ctx, name || 'external', SpanType.External, { attributes })
  }

  unresolvedExternal(ctx: otel.Context, options: CaptureOptions) {
    const {
      path,
      projectId,
      versionUuid,
      conversationUuid,
      name,
      attributes: userAttributes,
    } = options

    const attributes = {
      [ATTRIBUTES.LATITUDE.promptPath]: path,
      [ATTRIBUTES.LATITUDE.projectId]: projectId,
      ...(versionUuid && { [ATTRIBUTES.LATITUDE.commitUuid]: versionUuid }),
      ...(conversationUuid && {
        [ATTRIBUTES.LATITUDE.documentLogUuid]: conversationUuid,
      }),
      ...(userAttributes || {}),
    }

    return this.span(
      ctx,
      name || `capture-${path}`,
      SpanType.UnresolvedExternal,
      { attributes },
    )
  }
}
