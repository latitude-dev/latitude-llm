import { BaseInstrumentation } from '$telemetry/instrumentations/base'
import {
  ATTR_GEN_AI_COMPLETIONS,
  ATTR_GEN_AI_MESSAGE_CONTENT,
  ATTR_GEN_AI_MESSAGE_ROLE,
  ATTR_GEN_AI_MESSAGE_TOOL_CALL_ID,
  ATTR_GEN_AI_MESSAGE_TOOL_CALLS,
  ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ARGUMENTS,
  ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ID,
  ATTR_GEN_AI_MESSAGE_TOOL_CALLS_NAME,
  ATTR_GEN_AI_MESSAGE_TOOL_NAME,
  ATTR_GEN_AI_MESSAGE_TOOL_RESULT_IS_ERROR,
  ATTR_GEN_AI_PROMPTS,
  ATTR_GEN_AI_REQUEST,
  ATTR_GEN_AI_REQUEST_CONFIGURATION,
  ATTR_GEN_AI_REQUEST_MESSAGES,
  ATTR_GEN_AI_REQUEST_PARAMETERS,
  ATTR_GEN_AI_REQUEST_TEMPLATE,
  ATTR_GEN_AI_RESPONSE,
  ATTR_GEN_AI_RESPONSE_MESSAGES,
  ATTR_GEN_AI_TOOL_CALL_ARGUMENTS,
  ATTR_GEN_AI_TOOL_RESULT_IS_ERROR,
  ATTR_GEN_AI_TOOL_RESULT_VALUE,
  ATTR_GEN_AI_USAGE_CACHED_TOKENS,
  ATTR_GEN_AI_USAGE_COMPLETION_TOKENS,
  ATTR_GEN_AI_USAGE_PROMPT_TOKENS,
  ATTR_GEN_AI_USAGE_REASONING_TOKENS,
  ATTR_HTTP_REQUEST_BODY,
  ATTR_HTTP_REQUEST_HEADER,
  ATTR_HTTP_REQUEST_URL,
  ATTR_HTTP_RESPONSE_BODY,
  ATTR_HTTP_RESPONSE_HEADER,
  ATTR_LATITUDE_TYPE,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
  HEAD_COMMIT,
  LogSources,
  SPAN_SPECIFICATIONS,
  SpanType,
  TraceContext,
} from '@latitude-data/constants'
import * as otel from '@opentelemetry/api'
import { propagation, trace } from '@opentelemetry/api'
import {
  ATTR_HTTP_REQUEST_METHOD,
  ATTR_HTTP_RESPONSE_STATUS_CODE,
} from '@opentelemetry/semantic-conventions'
import {
  ATTR_GEN_AI_OPERATION_NAME,
  ATTR_GEN_AI_RESPONSE_FINISH_REASONS,
  ATTR_GEN_AI_RESPONSE_MODEL,
  ATTR_GEN_AI_SYSTEM,
  ATTR_GEN_AI_TOOL_CALL_ID,
  ATTR_GEN_AI_TOOL_NAME,
  ATTR_GEN_AI_TOOL_TYPE,
  ATTR_GEN_AI_USAGE_INPUT_TOKENS,
  ATTR_GEN_AI_USAGE_OUTPUT_TOKENS,
} from '@opentelemetry/semantic-conventions/incubating'

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
  configuration: Record<string, unknown>
  input: Record<string, unknown>[]
  versionUuid?: string
  promptUuid?: string
  experimentUuid?: string
}

export type EndCompletionSpanOptions = EndSpanOptions & {
  output: Record<string, unknown>[]
  tokens: {
    prompt: number
    cached: number
    reasoning: number
    completion: number
  }
  finishReason: string
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
  documentLogUuid?: string // TODO(tracing): temporal related log, remove when observability is ready
  versionUuid?: string // Alias for commitUuid
  promptUuid: string // Alias for documentUuid
  projectId?: string
  experimentUuid?: string
  externalId?: string
  template: string
  parameters?: Record<string, unknown>
  source?: LogSources
}

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

  resume(ctx: TraceContext) {
    return propagation.extract(otel.ROOT_CONTEXT, ctx)
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
          [ATTR_LATITUDE_TYPE]: type,
          ...(operation && {
            [ATTR_GEN_AI_OPERATION_NAME]: operation,
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
        [ATTR_GEN_AI_TOOL_NAME]: start.name,
        [ATTR_GEN_AI_TOOL_TYPE]: GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
        [ATTR_GEN_AI_TOOL_CALL_ID]: start.call.id,
        [ATTR_GEN_AI_TOOL_CALL_ARGUMENTS]: jsonArguments,
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
            [ATTR_GEN_AI_TOOL_RESULT_VALUE]: stringResult,
            [ATTR_GEN_AI_TOOL_RESULT_IS_ERROR]: end.result.isError,
            ...(end.attributes || {}),
          },
        })
      },
      fail: span.fail,
    }
  }

  private attribifyMessageToolCalls(
    prefix: string,
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
            attributes[
              `${prefix}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ID}`
            ] = value
            break
          }

          case 'name':
          case 'toolName': {
            if (typeof value !== 'string') continue
            attributes[
              `${prefix}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS_NAME}`
            ] = value
            break
          }

          case 'arguments':
          case 'toolArguments':
          case 'input': {
            if (typeof value === 'string') {
              attributes[
                `${prefix}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ARGUMENTS}`
              ] = value
            } else {
              try {
                attributes[
                  `${prefix}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ARGUMENTS}`
                ] = JSON.stringify(value)
              } catch (error) {
                attributes[
                  `${prefix}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ARGUMENTS}`
                ] = '{}'
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
            attributes[
              `${prefix}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS_NAME}`
            ] = value.name
            attributes[
              `${prefix}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_CALLS_ARGUMENTS}`
            ] = value.arguments
            break
          }
        }
      }
    }

    return attributes
  }

  private attribifyMessageContent(prefix: string, content: unknown) {
    let attributes: otel.Attributes = {}

    if (typeof content === 'string') {
      attributes[`${prefix}.${ATTR_GEN_AI_MESSAGE_CONTENT}`] = content
      return attributes
    }

    try {
      attributes[`${prefix}.${ATTR_GEN_AI_MESSAGE_CONTENT}`] =
        JSON.stringify(content)
    } catch (error) {
      attributes[`${prefix}.${ATTR_GEN_AI_MESSAGE_CONTENT}`] = '[]'
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
        ...this.attribifyMessageToolCalls(prefix, toolCalls),
      }
    }

    return attributes
  }

  private attribifyMessages(
    direction: 'input' | 'output',
    messages: Record<string, unknown>[],
  ) {
    const prefix =
      direction === 'input' ? ATTR_GEN_AI_PROMPTS : ATTR_GEN_AI_COMPLETIONS

    let attributes: otel.Attributes = {}
    for (let i = 0; i < messages.length; i++) {
      for (const key in messages[i]!) {
        const field = this.toCamelCase(key)
        let value = messages[i]![key]
        if (value === null || value === undefined) continue

        switch (field) {
          case 'role': {
            if (typeof value !== 'string') continue
            attributes[`${prefix}.${i}.${ATTR_GEN_AI_MESSAGE_ROLE}`] = value
            break
          }

          /* Tool calls for Anthropic and PromptL are in the content */
          case 'content': {
            attributes = {
              ...attributes,
              ...this.attribifyMessageContent(`${prefix}.${i}`, value),
            }
            break
          }

          /* Tool calls for OpenAI */
          case 'toolCalls': {
            if (!Array.isArray(value)) continue
            attributes = {
              ...attributes,
              ...this.attribifyMessageToolCalls(`${prefix}.${i}`, value),
            }
            break
          }

          /* Tool result for OpenAI / Anthropic / PromptL */

          case 'toolCallId':
          case 'toolId':
          case 'toolUseId': {
            if (typeof value !== 'string') continue
            attributes[`${prefix}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_CALL_ID}`] =
              value
            break
          }

          case 'toolName': {
            if (typeof value !== 'string') continue
            attributes[`${prefix}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_NAME}`] =
              value
            break
          }

          // Note: 'toolResult' is 'content' itself

          case 'isError': {
            if (typeof value !== 'boolean') continue
            attributes[
              `${prefix}.${i}.${ATTR_GEN_AI_MESSAGE_TOOL_RESULT_IS_ERROR}`
            ] = value
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
      direction === 'input' ? ATTR_GEN_AI_REQUEST : ATTR_GEN_AI_RESPONSE

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
      ...start.configuration,
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

    let jsonInput = ''
    try {
      jsonInput = JSON.stringify(start.input)
    } catch (error) {
      jsonInput = '[]'
    }
    const attrInput = this.attribifyMessages('input', start.input)
    const span = this.span(
      ctx,
      start.name || `${start.provider} / ${start.model}`,
      SpanType.Completion,
      {
        attributes: {
          [ATTR_GEN_AI_SYSTEM]: start.provider,
          [ATTR_GEN_AI_REQUEST_CONFIGURATION]: jsonConfiguration,
          ...attrConfiguration,
          [ATTR_GEN_AI_REQUEST_MESSAGES]: jsonInput,
          ...attrInput,
          ...(start.attributes || {}),
          ['latitude.commitUuid']: start.versionUuid,
          ['latitude.documentUuid']: start.promptUuid,
          ['latitude.experimentUuid']: start.experimentUuid,
        },
      },
    )

    return {
      context: span.context,
      end: (options: EndCompletionSpanOptions) => {
        const end = options

        let jsonOutput = ''
        try {
          jsonOutput = JSON.stringify(end.output)
        } catch (error) {
          jsonOutput = '[]'
        }
        const attrOutput = this.attribifyMessages('output', end.output)

        const inputTokens = end.tokens.prompt + end.tokens.cached
        const outputTokens = end.tokens.reasoning + end.tokens.completion

        span.end({
          attributes: {
            [ATTR_GEN_AI_RESPONSE_MESSAGES]: jsonOutput,
            ...attrOutput,
            [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: inputTokens,
            [ATTR_GEN_AI_USAGE_PROMPT_TOKENS]: end.tokens.prompt,
            [ATTR_GEN_AI_USAGE_CACHED_TOKENS]: end.tokens.cached,
            [ATTR_GEN_AI_USAGE_REASONING_TOKENS]: end.tokens.reasoning,
            [ATTR_GEN_AI_USAGE_COMPLETION_TOKENS]: end.tokens.completion,
            [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: outputTokens,
            [ATTR_GEN_AI_RESPONSE_MODEL]: start.model,
            [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [end.finishReason],
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

  retrieval(ctx: otel.Context, options?: StartSpanOptions) {
    return this.span(
      ctx,
      options?.name || SPAN_SPECIFICATIONS[SpanType.Retrieval].name,
      SpanType.Retrieval,
      options,
    )
  }

  reranking(ctx: otel.Context, options?: StartSpanOptions) {
    return this.span(
      ctx,
      options?.name || SPAN_SPECIFICATIONS[SpanType.Reranking].name,
      SpanType.Reranking,
      options,
    )
  }

  private attribifyHeaders(
    direction: 'request' | 'response',
    headers: Record<string, string>,
  ) {
    const prefix =
      direction === 'request'
        ? ATTR_HTTP_REQUEST_HEADER
        : ATTR_HTTP_RESPONSE_HEADER

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
          [ATTR_HTTP_REQUEST_METHOD]: method,
          [ATTR_HTTP_REQUEST_URL]: start.request.url,
          ...attrHeaders,
          [ATTR_HTTP_REQUEST_BODY]: finalBody,
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
            [ATTR_HTTP_RESPONSE_STATUS_CODE]: end.response.status,
            ...attrHeaders,
            [ATTR_HTTP_RESPONSE_BODY]: finalBody,
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
      [ATTR_GEN_AI_REQUEST_TEMPLATE]: template,
      [ATTR_GEN_AI_REQUEST_PARAMETERS]: jsonParameters,
      ['latitude.commitUuid']: versionUuid || HEAD_COMMIT,
      ['latitude.documentUuid']: promptUuid,
      ['latitude.projectId']: projectId,
      ...(documentLogUuid && { ['latitude.documentLogUuid']: documentLogUuid }),
      ...(experimentUuid && { ['latitude.experimentUuid']: experimentUuid }),
      ...(externalId && { ['latitude.externalId']: externalId }),
      ...(source && { ['latitude.source']: source }),
      ...(rest.attributes || {}),
    }

    return this.span(ctx, name || `prompt-${promptUuid}`, SpanType.Prompt, {
      attributes,
    })
  }

  step(ctx: otel.Context, options?: StartSpanOptions) {
    return this.span(ctx, 'step', SpanType.Step, options)
  }
}
