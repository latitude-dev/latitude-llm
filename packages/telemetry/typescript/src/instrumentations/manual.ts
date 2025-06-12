 
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
  ATTR_HTTP_REQUEST_BODY,
  ATTR_HTTP_REQUEST_HEADERS,
  ATTR_HTTP_REQUEST_URL,
  ATTR_HTTP_RESPONSE_BODY,
  ATTR_HTTP_RESPONSE_HEADERS,
  ATTR_LATITUDE_EXTERNAL_ID,
  ATTR_LATITUDE_SEGMENT_ID,
  ATTR_LATITUDE_SEGMENT_PARENT_ID,
  ATTR_LATITUDE_SEGMENTS,
  ATTR_LATITUDE_SOURCE,
  ATTR_LATITUDE_TYPE,
  BaseSegmentBaggage,
  DocumentSegmentBaggage,
  GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
  HEAD_COMMIT,
  SegmentBaggage,
  SegmentType,
  SpanSource,
  SpanType,
} from '@latitude-data/constants'
import * as otel from '@opentelemetry/api'
import { context, propagation, trace } from '@opentelemetry/api'
import { RandomIdGenerator } from '@opentelemetry/sdk-trace-node'
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
import { v4 as uuid } from 'uuid'

export type StartSpanOptions = {
  name?: string
  externalId?: string
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
  template?: string
  parameters?: Record<string, unknown>
  input: Record<string, unknown>[]
}

export type EndCompletionSpanOptions = EndSpanOptions & {
  output: Record<string, unknown>[]
  tokens: {
    input: number
    output: number
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

export type SegmentOptions = StartSpanOptions & {
  baggage?: Record<string, unknown>
}

export type DocumentSegmentOptions = SegmentOptions & {
  versionUuid?: string
  documentUuid: string
  experimentUuid?: string
}

export class ManualInstrumentation implements BaseInstrumentation {
  private enabled: boolean
  private readonly source: SpanSource
  private readonly tracer: otel.Tracer
  private readonly generator: RandomIdGenerator

  constructor(source: SpanSource, tracer: otel.Tracer) {
    this.enabled = false
    this.source = source
    this.tracer = tracer
    this.generator = new RandomIdGenerator()
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

  private capitalize(str: string): string {
    if (str.length === 0) return str
    return str.charAt(0).toUpperCase() + str.toLowerCase().slice(1)
  }

  private toCamelCase(str: string): string {
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

  private error(ctx: otel.Context, error: Error, options?: ErrorOptions) {
    options = options || {}

    const span = trace.getSpan(ctx)
    if (!span) return

    span.recordException(error)
    span.setAttributes({ ...(options.attributes || {}) })
    span.setStatus({
      code: otel.SpanStatusCode.ERROR,
      message: error.message || undefined,
    })
    span.end()
  }

  private span(
    ctx: otel.Context,
    name: string,
    type: SpanType,
    options?: StartSpanOptions,
  ) {
    if (!this.enabled) {
      return [
        ctx,
        (_options?: EndSpanOptions) => {},
        (_error: Error, _options?: ErrorOptions) => {},
      ] as const
    }

    const start = options || {}

    const span = this.tracer.startSpan(
      name,
      {
        attributes: {
          ...(start.externalId && {
            [ATTR_LATITUDE_EXTERNAL_ID]: start.externalId,
          }),
          [ATTR_LATITUDE_SOURCE]: this.source,
          [ATTR_LATITUDE_TYPE]: type,
          [ATTR_GEN_AI_OPERATION_NAME]: type,
          ...(start.attributes || {}),
        },
        kind: otel.SpanKind.CLIENT,
      },
      ctx,
    )

    const newCtx = trace.setSpan(ctx, span)

    return [
      newCtx,
      (options?: EndSpanOptions) => {
        const end = options || {}

        span.setAttributes(end.attributes || {})
        span.setStatus({ code: otel.SpanStatusCode.OK })
        span.end()
      },
      (error: Error, options?: ErrorOptions) => {
        this.error(newCtx, error, options)
      },
    ] as const
  }

  tool(ctx: otel.Context, options: StartToolSpanOptions) {
    const start = options

    let jsonArguments = ''
    try {
      jsonArguments = JSON.stringify(start.call.arguments)
    } catch (error) {
      jsonArguments = '{}'
    }

    const [newCtx, ok, err] = this.span(ctx, start.name, SpanType.Tool, {
      externalId: start.externalId,
      attributes: {
        [ATTR_GEN_AI_TOOL_NAME]: start.name,
        [ATTR_GEN_AI_TOOL_TYPE]: GEN_AI_TOOL_TYPE_VALUE_FUNCTION,
        [ATTR_GEN_AI_TOOL_CALL_ID]: start.call.id,
        [ATTR_GEN_AI_TOOL_CALL_ARGUMENTS]: jsonArguments,
        ...(start.attributes || {}),
      },
    })

    return [
      newCtx,
      (options: EndToolSpanOptions) => {
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

        ok({
          attributes: {
            [ATTR_GEN_AI_TOOL_RESULT_VALUE]: stringResult,
            [ATTR_GEN_AI_TOOL_RESULT_IS_ERROR]: end.result.isError,
            ...(end.attributes || {}),
          },
        })
      },
      (error: Error, options?: ErrorOptions) => err(error, options),
    ] as const
  }

  private attribifyMessageToolCalls(
    prefix: string,
    toolCalls: Record<string, unknown>[],
  ) {
    const attributes: otel.Attributes = {}

    for (let i = 0; i < toolCalls.length; i++) {
      for (const key in toolCalls[i]!) {
        const field = this.toCamelCase(key)
        const value = toolCalls[i]![key]
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
        const value = messages[i]![key]
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

    let jsonParameters = undefined
    if (start.parameters) {
      try {
        jsonParameters = JSON.stringify(start.parameters)
      } catch (error) {
        jsonParameters = '{}'
      }
    }

    let jsonInput = ''
    try {
      jsonInput = JSON.stringify(start.input)
    } catch (error) {
      jsonInput = '[]'
    }
    const attrInput = this.attribifyMessages('input', start.input)

    const [newCtx, ok, err] = this.span(
      ctx,
      start.name || `${start.provider} / ${start.model}`,
      SpanType.Completion,
      {
        externalId: start.externalId,
        attributes: {
          [ATTR_GEN_AI_SYSTEM]: start.provider,
          [ATTR_GEN_AI_REQUEST_CONFIGURATION]: jsonConfiguration,
          ...attrConfiguration,
          ...(start.template && {
            [ATTR_GEN_AI_REQUEST_TEMPLATE]: start.template,
          }),
          ...(jsonParameters && {
            [ATTR_GEN_AI_REQUEST_PARAMETERS]: jsonParameters,
          }),
          [ATTR_GEN_AI_REQUEST_MESSAGES]: jsonInput,
          ...attrInput,
          ...(start.attributes || {}),
        },
      },
    )

    return [
      newCtx,
      (options: EndCompletionSpanOptions) => {
        const end = options

        let jsonOutput = ''
        try {
          jsonOutput = JSON.stringify(end.output)
        } catch (error) {
          jsonOutput = '[]'
        }
        const attrOutput = this.attribifyMessages('output', end.output)

        ok({
          attributes: {
            [ATTR_GEN_AI_RESPONSE_MESSAGES]: jsonOutput,
            ...attrOutput,
            [ATTR_GEN_AI_USAGE_INPUT_TOKENS]: end.tokens.input,
            [ATTR_GEN_AI_USAGE_OUTPUT_TOKENS]: end.tokens.output,
            [ATTR_GEN_AI_RESPONSE_MODEL]: start.model,
            [ATTR_GEN_AI_RESPONSE_FINISH_REASONS]: [end.finishReason],
            ...(end.attributes || {}),
          },
        })
      },
      (error: Error, options?: ErrorOptions) => err(error, options),
    ] as const
  }

  embedding(ctx: otel.Context, options?: StartSpanOptions) {
    const start = options || {}

    const [newCtx, ok, err] = this.span(
      ctx,
      start.name || 'Embedding',
      SpanType.Embedding,
      {
        externalId: start.externalId,
        attributes: { ...(start.attributes || {}) },
      },
    )

    return [
      newCtx,
      (options?: EndSpanOptions) => {
        const end = options || {}

        ok({
          attributes: { ...(end.attributes || {}) },
        })
      },
      (error: Error, options?: ErrorOptions) => err(error, options),
    ] as const
  }

  retrieval(ctx: otel.Context, options?: StartSpanOptions) {
    const start = options || {}

    const [newCtx, ok, err] = this.span(
      ctx,
      start.name || 'Retrieval',
      SpanType.Retrieval,
      {
        externalId: start.externalId,
        attributes: { ...(start.attributes || {}) },
      },
    )

    return [
      newCtx,
      (options?: EndSpanOptions) => {
        const end = options || {}

        ok({
          attributes: { ...(end.attributes || {}) },
        })
      },
      (error: Error, options?: ErrorOptions) => err(error, options),
    ] as const
  }

  reranking(ctx: otel.Context, options?: StartSpanOptions) {
    const start = options || {}

    const [newCtx, ok, err] = this.span(
      ctx,
      start.name || 'Reranking',
      SpanType.Reranking,
      {
        externalId: start.externalId,
        attributes: { ...(start.attributes || {}) },
      },
    )

    return [
      newCtx,
      (options?: EndSpanOptions) => {
        const end = options || {}

        ok({
          attributes: { ...(end.attributes || {}) },
        })
      },
      (error: Error, options?: ErrorOptions) => err(error, options),
    ] as const
  }

  private attribifyHeaders(
    direction: 'request' | 'response',
    headers: Record<string, string>,
  ) {
    const prefix =
      direction === 'request'
        ? ATTR_HTTP_REQUEST_HEADERS
        : ATTR_HTTP_RESPONSE_HEADERS

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

    const [newCtx, ok, err] = this.span(
      ctx,
      start.name || `${method} ${start.request.url}`,
      SpanType.Http,
      {
        externalId: start.externalId,
        attributes: {
          [ATTR_HTTP_REQUEST_METHOD]: method,
          [ATTR_HTTP_REQUEST_URL]: start.request.url,
          ...attrHeaders,
          [ATTR_HTTP_REQUEST_BODY]: finalBody,
          ...(start.attributes || {}),
        },
      },
    )

    return [
      newCtx,
      (options: EndHttpSpanOptions) => {
        const end = options

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

        ok({
          attributes: {
            [ATTR_HTTP_RESPONSE_STATUS_CODE]: end.response.status,
            ...attrHeaders,
            [ATTR_HTTP_RESPONSE_BODY]: finalBody,
            ...(end.attributes || {}),
          },
        })
      },
      (error: Error, options?: ErrorOptions) => err(error, options),
    ] as const
  }

  private segment<F extends () => ReturnType<F>>(
    type: SegmentType,
    { name, externalId, attributes, baggage }: SegmentOptions,
    fn: F,
  ) {
    if (!this.enabled) return fn()

    const parentBaggage = Object.fromEntries(
      propagation.getActiveBaggage()?.getAllEntries() || [],
    )

    let segments: SegmentBaggage[] = []
    if (ATTR_LATITUDE_SEGMENTS in parentBaggage) {
      try {
        segments = JSON.parse(parentBaggage[ATTR_LATITUDE_SEGMENTS].value)
      } catch (error) {
        segments = []
      }
    }

    const parentId = parentBaggage[ATTR_LATITUDE_SEGMENT_ID]?.value
    const segmentId = this.generator.generateSpanId()

    segments.push({
      id: segmentId,
      ...(parentId && { parentId }),
      ...(name && { name }),
      type: type,
      ...(baggage || {}),
    } as SegmentBaggage)

    let jsonSegments = ''
    try {
      jsonSegments = JSON.stringify(segments)
    } catch (error) {
      jsonSegments = '[]'
    }

    const baggAttributes = Object.fromEntries(
      Object.entries(attributes || {}).map(([key, value]) => [
        key,
        { value: String(value) },
      ]),
    )

    const payload = propagation.createBaggage({
      // Cascade parent baggage
      ...parentBaggage,
      // Note: this is not baggage, just a way to pass attributes down more easily
      ...(externalId && { [ATTR_LATITUDE_EXTERNAL_ID]: { value: externalId } }),
      [ATTR_LATITUDE_SOURCE]: { value: this.source },
      ...baggAttributes,
      // Current segment baggage
      [ATTR_LATITUDE_SEGMENT_ID]: { value: segmentId },
      ...(parentId && {
        [ATTR_LATITUDE_SEGMENT_PARENT_ID]: { value: parentId },
      }),
      [ATTR_LATITUDE_SEGMENTS]: { value: jsonSegments },
    })

    // Dummy wrapper span so children spans belong to the same trace.
    return context.with(
      propagation.setBaggage(context.active(), payload),
      () => {
        const [ctx, ok, err] = this.span(
          context.active(),
          type,
          SpanType.Unknown,
        )

        let result
        try {
          result = context.with(ctx, fn)
        } catch (error) {
          err(error as Error)
          throw error
        }

        if (result instanceof Promise) result.then(ok).catch(err)
        else ok()

        return result
      },
    )
  }

  document<F extends () => ReturnType<F>>(
    {
      baggage,
      versionUuid,
      documentUuid,
      experimentUuid,
      ...rest
    }: DocumentSegmentOptions,
    fn: F,
  ) {
    baggage = {
      documentRunUuid: uuid(),
      versionUuid: versionUuid || HEAD_COMMIT,
      documentUuid: documentUuid,
      ...(experimentUuid && { experimentUuid }),
      ...(baggage || {}),
    } as Omit<DocumentSegmentBaggage, keyof BaseSegmentBaggage>

    return this.segment(SegmentType.Document, { baggage, ...rest }, fn)
  }

  step<F extends () => ReturnType<F>>(options: SegmentOptions, fn: F) {
    return this.segment(SegmentType.Step, options, fn)
  }
}
