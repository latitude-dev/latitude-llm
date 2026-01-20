import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import {
  ATTRIBUTES,
  HEAD_COMMIT,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
  TraceContext,
  VALUES,
} from '@latitude-data/constants'
import * as otel from '@opentelemetry/api'
import { propagation, trace } from '@opentelemetry/api'

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

export type StartToolSpanOptions = StartSpanOptions & {
  name: string
  call: {
    id: string
    arguments: Record<string, unknown>
  }
}

export type EndToolSpanOptions = EndSpanOptions & {
  result: {
    value: unknown
    isError: boolean
  }
}

export type StartCompletionSpanOptions = StartSpanOptions & {
  provider: string
  model: string
  configuration?: Record<string, unknown>
  input?: Record<string, unknown>[]
  versionUuid?: string
  promptUuid?: string
  experimentUuid?: string
}

export type EndCompletionSpanOptions = EndSpanOptions & {
  output?: Record<string, unknown>[]
  tokens?: {
    prompt?: number
    cached?: number
    reasoning?: number
    completion?: number
  }
  finishReason?: string
}

export type StartHttpSpanOptions = StartSpanOptions & {
  request: {
    method: string
    url: string
    headers: Record<string, string>
    body: string | Record<string, unknown>
  }
}

export type EndHttpSpanOptions = EndSpanOptions & {
  response: {
    status: number
    headers: Record<string, string>
    body: string | Record<string, unknown>
  }
}

export type PromptSpanOptions = StartSpanOptions & {
  documentLogUuid: string
  versionUuid?: string // Alias for commitUuid
  promptUuid: string // Alias for documentUuid
  projectId?: number
  experimentUuid?: string
  testDeploymentId?: number
  externalId?: string
  template: string
  parameters?: Record<string, unknown>
  source?: LogSources
}

export type ChatSpanOptions = StartSpanOptions & {
  documentLogUuid: string
  previousTraceId: string
  source?: LogSources
}

export type ExternalSpanOptions = StartSpanOptions & {
  promptUuid: string // Alias for documentUuid
  documentLogUuid: string
  source?: LogSources // Defaults to LogSources.API
  versionUuid?: string // Alias for commitUuid
  externalId?: string
}

export type CaptureOptions = StartSpanOptions & {
  path: string // The document path
  projectId: number
  versionUuid?: string // Optional, defaults to HEAD commit
  conversationUuid?: string // Optional, if provided, will be used as the documentLogUuid
}

type OtelGenAiField =
  | typeof ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.prompt
  | typeof ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.completion

type OtelGenAiMessageField = ReturnType<OtelGenAiField['index']>

export class ManualInstrumentation implements BaseInstrumentation {
  private enabled: boolean
  private readonly tracer: otel.Tracer

  constructor(tracer: otel.Tracer) {
    this.enabled = false
    this.tracer = tracer
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

  private capitalize(str: string) {
    if (str.length === 0) return str
    return str.charAt(0).toUpperCase() + str.toLowerCase().slice(1)
  }

  private toCamelCase(str: string) {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .map((w, i) => (i ? this.capitalize(w) : w.toLowerCase()))
      .join('')
  }

  private toSnakeCase(str: string) {
    return str
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
  }

  private toKebabCase(input: string) {
    return input
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
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
    } catch (error) {
      jsonArguments = '{}'
    }

    const span = this.span(ctx, start.name, SpanType.Tool, {
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
      context: span.context,
      end: (options: EndToolSpanOptions) => {
        const end = options

        let stringResult = ''
        if (typeof end.result.value !== 'string') {
          try {
            stringResult = JSON.stringify(end.result.value)
          } catch (error) {
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
      fail: span.fail,
    }
  }

  private attribifyMessageToolCalls(
    otelMessageField: OtelGenAiMessageField,
    toolCalls: Record<string, unknown>[],
  ) {
    const attributes: otel.Attributes = {}

    for (let i = 0; i < toolCalls.length; i++) {
      for (const key in toolCalls[i]!) {
        const field = this.toCamelCase(key)
        let value = toolCalls[i]![key]
        if (value === null || value === undefined) continue

        switch (field) {
          case 'id':
          case 'toolCallId':
          case 'toolUseId': {
            if (typeof value !== 'string') continue
            attributes[otelMessageField.toolCalls(i).id] = value
            break
          }

          case 'name':
          case 'toolName': {
            if (typeof value !== 'string') continue
            attributes[otelMessageField.toolCalls(i).name] = value
            break
          }

          case 'arguments':
          case 'toolArguments':
          case 'input': {
            if (typeof value === 'string') {
              attributes[otelMessageField.toolCalls(i).arguments] = value
            } else {
              try {
                attributes[otelMessageField.toolCalls(i).arguments] =
                  JSON.stringify(value)
              } catch (error) {
                attributes[otelMessageField.toolCalls(i).arguments] = '{}'
              }
            }
            break
          }

          /* OpenAI function calls */
          case 'function': {
            if (typeof value !== 'object') continue
            if (!('name' in value)) continue
            if (typeof value.name !== 'string') continue
            if (!('arguments' in value)) continue
            if (typeof value.arguments !== 'string') continue
            attributes[otelMessageField.toolCalls(i).name] = value.name
            attributes[otelMessageField.toolCalls(i).arguments] =
              value.arguments
            break
          }
        }
      }
    }

    return attributes
  }

  private attribifyMessageContent(
    otelMessageField: OtelGenAiMessageField,
    content: unknown,
  ) {
    let attributes: otel.Attributes = {}

    if (typeof content === 'string') {
      attributes[otelMessageField.content]
      return attributes
    }

    try {
      attributes[otelMessageField.content] = JSON.stringify(content)
    } catch (error) {
      attributes[otelMessageField.content] = '[]'
    }

    if (!Array.isArray(content)) return attributes

    /* Tool calls for Anthropic and PromptL are in the content */
    const toolCalls = []
    for (const item of content) {
      for (const key in item) {
        if (this.toCamelCase(key) !== 'type') continue
        if (typeof item[key] !== 'string') continue
        if (item[key] !== 'tool-call' && item[key] !== 'tool_use') continue
        toolCalls.push(item)
      }
    }

    if (toolCalls.length > 0) {
      attributes = {
        ...attributes,
        ...this.attribifyMessageToolCalls(otelMessageField, toolCalls),
      }
    }

    return attributes
  }

  private attribifyMessages(
    direction: 'input' | 'output',
    messages: Record<string, unknown>[],
  ) {
    const otelField =
      direction === 'input'
        ? ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.prompt
        : ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.completion

    let attributes: otel.Attributes = {}
    for (let i = 0; i < messages.length; i++) {
      for (const key in messages[i]!) {
        const field = this.toCamelCase(key)
        let value = messages[i]![key]
        if (value === null || value === undefined) continue

        switch (field) {
          case 'role': {
            if (typeof value !== 'string') continue
            attributes[otelField.index(i).role] = value
            break
          }

          /* Tool calls for Anthropic and PromptL are in the content */
          case 'content': {
            attributes = {
              ...attributes,
              ...this.attribifyMessageContent(otelField.index(i), value),
            }
            break
          }

          /* Tool calls for OpenAI */
          case 'toolCalls': {
            if (!Array.isArray(value)) continue
            attributes = {
              ...attributes,
              ...this.attribifyMessageToolCalls(otelField.index(i), value),
            }
            break
          }

          /* Tool result for OpenAI / Anthropic / PromptL */

          case 'toolCallId':
          case 'toolId':
          case 'toolUseId': {
            if (typeof value !== 'string') continue
            attributes[otelField.index(i).tool.callId] = value
            break
          }

          case 'toolName': {
            if (typeof value !== 'string') continue
            attributes[otelField.index(i).tool.toolName] = value
            break
          }

          // Note: 'toolResult' is 'content' itself

          case 'isError': {
            if (typeof value !== 'boolean') continue
            attributes[otelField.index(i).tool.isError] = value
            break
          }
        }
      }
    }

    return attributes
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
      const field = this.toSnakeCase(key)
      let value = configuration[key]
      if (value === null || value === undefined) continue
      if (typeof value === 'object' && !Array.isArray(value)) {
        try {
          value = JSON.stringify(value)
        } catch (error) {
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
    } catch (error) {
      jsonConfiguration = '{}'
    }
    const attrConfiguration = this.attribifyConfiguration(
      'input',
      configuration,
    )

    const input = start.input ?? []
    let jsonInput = ''
    try {
      jsonInput = JSON.stringify(input)
    } catch (error) {
      jsonInput = '[]'
    }
    const attrInput = this.attribifyMessages('input', input)
    const span = this.span(
      ctx,
      start.name || `${start.provider} / ${start.model}`,
      SpanType.Completion,
      {
        attributes: {
          [ATTRIBUTES.OPENTELEMETRY.GEN_AI._deprecated.system]: start.provider,
          [ATTRIBUTES.LATITUDE.request.configuration]: jsonConfiguration,
          ...attrConfiguration,
          [ATTRIBUTES.LATITUDE.request.messages]: jsonInput,
          ...attrInput,
          ...(start.attributes || {}),
          [ATTRIBUTES.LATITUDE.commitUuid]: start.versionUuid,
          [ATTRIBUTES.LATITUDE.documentUuid]: start.promptUuid,
          [ATTRIBUTES.LATITUDE.experimentUuid]: start.experimentUuid,
        },
      },
    )

    return {
      context: span.context,
      end: (options?: EndCompletionSpanOptions) => {
        const end = options ?? {}

        const output = end.output ?? []
        let jsonOutput = ''
        try {
          jsonOutput = JSON.stringify(output)
        } catch (error) {
          jsonOutput = '[]'
        }
        const attrOutput = this.attribifyMessages('output', output)

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
            [ATTRIBUTES.LATITUDE.response.messages]: jsonOutput,
            ...attrOutput,
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
      fail: span.fail,
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
      const field = this.toKebabCase(key)
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
      } catch (error) {
        finalBody = '{}'
      }
    }

    const span = this.span(
      ctx,
      start.name || `${method} ${start.request.url}`,
      SpanType.Http,
      {
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
      context: span.context,
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
          } catch (error) {
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
      fail: span.fail,
    }
  }

  prompt(
    ctx: otel.Context,
    {
      documentLogUuid,
      versionUuid,
      promptUuid,
      projectId,
      experimentUuid,
      testDeploymentId,
      externalId,
      template,
      parameters,
      name,
      source,
      ...rest
    }: PromptSpanOptions,
  ) {
    let jsonParameters = ''
    try {
      jsonParameters = JSON.stringify(parameters || {})
    } catch (error) {
      jsonParameters = '{}'
    }

    const attributes = {
      [ATTRIBUTES.LATITUDE.request.template]: template,
      [ATTRIBUTES.LATITUDE.request.parameters]: jsonParameters,
      [ATTRIBUTES.LATITUDE.commitUuid]: versionUuid || HEAD_COMMIT,
      [ATTRIBUTES.LATITUDE.documentUuid]: promptUuid,
      [ATTRIBUTES.LATITUDE.projectId]: projectId,
      [ATTRIBUTES.LATITUDE.documentLogUuid]: documentLogUuid,
      ...(experimentUuid && {
        [ATTRIBUTES.LATITUDE.experimentUuid]: experimentUuid,
      }),
      ...(testDeploymentId && {
        [ATTRIBUTES.LATITUDE.testDeploymentId]: testDeploymentId,
      }),
      ...(externalId && { [ATTRIBUTES.LATITUDE.externalId]: externalId }),
      ...(source && { [ATTRIBUTES.LATITUDE.source]: source }),
      ...(rest.attributes || {}),
    }

    return this.span(ctx, name || `prompt-${promptUuid}`, SpanType.Prompt, {
      attributes,
    })
  }

  chat(
    ctx: otel.Context,
    {
      documentLogUuid,
      previousTraceId,
      source,
      name,
      ...rest
    }: ChatSpanOptions,
  ) {
    const attributes = {
      [ATTRIBUTES.LATITUDE.documentLogUuid]: documentLogUuid,
      [ATTRIBUTES.LATITUDE.previousTraceId]: previousTraceId,
      ...(source && { [ATTRIBUTES.LATITUDE.source]: source }),
      ...(rest.attributes || {}),
    }

    return this.span(ctx, name || `chat-${documentLogUuid}`, SpanType.Chat, {
      attributes,
    })
  }

  external(
    ctx: otel.Context,
    {
      promptUuid,
      documentLogUuid,
      source,
      versionUuid,
      externalId,
      name,
      ...rest
    }: ExternalSpanOptions,
  ) {
    const attributes = {
      [ATTRIBUTES.LATITUDE.documentUuid]: promptUuid,
      [ATTRIBUTES.LATITUDE.documentLogUuid]: documentLogUuid,
      [ATTRIBUTES.LATITUDE.source]: source ?? LogSources.API,
      ...(versionUuid && { [ATTRIBUTES.LATITUDE.commitUuid]: versionUuid }),
      ...(externalId && { [ATTRIBUTES.LATITUDE.externalId]: externalId }),
      ...(rest.attributes || {}),
    }

    return this.span(ctx, name || `external-${promptUuid}`, SpanType.External, {
      attributes,
    })
  }

  unresolvedExternal(
    ctx: otel.Context,
    {
      path,
      projectId,
      versionUuid,
      conversationUuid,
      name,
      ...rest
    }: CaptureOptions,
  ) {
    const attributes = {
      [ATTRIBUTES.LATITUDE.promptPath]: path,
      [ATTRIBUTES.LATITUDE.projectId]: projectId,
      ...(versionUuid && { [ATTRIBUTES.LATITUDE.commitUuid]: versionUuid }),
      ...(conversationUuid && {
        [ATTRIBUTES.LATITUDE.documentLogUuid]: conversationUuid,
      }),
      ...(rest.attributes || {}),
    }

    return this.span(
      ctx,
      name || `capture-${path}`,
      SpanType.UnresolvedExternal,
      { attributes },
    )
  }
}
