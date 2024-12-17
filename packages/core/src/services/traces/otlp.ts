import { PROVIDER_MODELS, Providers, SpanKind } from '../../constants'
import { spans } from '../../schema'
import { estimateCost } from '../ai'
import { extractInputOutput } from './extractInputOutput'

// Types
// ----------------------------------------

export type OtlpSpan = {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: number
  startTimeUnixNano: string
  endTimeUnixNano?: string
  attributes?: Array<{
    key: string
    value: { stringValue?: string; intValue?: number; boolValue?: boolean }
  }>
  status?: {
    code: number
    message?: string
  }
  events?: Array<{
    timeUnixNano: string
    name: string
    attributes?: Array<{
      key: string
      value: { stringValue?: string; intValue?: number; boolValue?: boolean }
    }>
  }>
  links?: Array<{
    traceId: string
    spanId: string
    attributes?: Array<{
      key: string
      value: { stringValue?: string; intValue?: number; boolValue?: boolean }
    }>
  }>
}

export type ResourceSpan = {
  resource: {
    attributes: Array<{
      key: string
      value: { stringValue?: string; intValue?: number; boolValue?: boolean }
    }>
  }
  scopeSpans: Array<{
    spans: OtlpSpan[]
  }>
}

type ToolCall = {
  id: string
  name: string
  description?: string
  arguments: Record<string, unknown>
}

type LatitudeAttrs = {
  distinctId: string | undefined
  commitUuid: string | undefined
  metadata: Record<string, unknown> | undefined
  documentUuid?: string
  parameters?: Record<string, unknown> | undefined
}

// Main Export Functions
// ----------------------------------------

export function processSpan({ span }: { span: OtlpSpan }) {
  const startTime = new Date(parseInt(span.startTimeUnixNano) / 1_000_000)
  const endTime = span.endTimeUnixNano
    ? new Date(parseInt(span.endTimeUnixNano) / 1_000_000)
    : undefined

  const { status, statusMessage } = convertOtlpStatus({ status: span.status })
  const attributes = convertOtlpAttributes({ attributes: span.attributes })

  // Extract Latitude-specific attributes
  const latitudeAttrs = extractLatitudeAttrs(attributes)

  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: convertOtlpSpanKind({ kind: span.kind }),
    startTime,
    endTime,
    attributes,
    status,
    statusMessage,
    events: span.events?.map((event) => ({
      name: event.name,
      timestamp: new Date(
        parseInt(event.timeUnixNano) / 1_000_000,
      ).toISOString(),
      attributes: convertOtlpAttributes({ attributes: event.attributes }),
    })),
    links: span.links?.map((link) => ({
      traceId: link.traceId,
      spanId: link.spanId,
      attributes: convertOtlpAttributes({ attributes: link.attributes }),
    })),
    ...processGenerationSpan(span),
    ...latitudeAttrs,
  }
}

// OTLP Conversion Helpers
// ----------------------------------------

export function convertOtlpAttributes({
  attributes = [],
}: {
  attributes?: Array<{
    key: string
    value: { stringValue?: string; intValue?: number; boolValue?: boolean }
  }>
}): Record<string, string | number | boolean> {
  return attributes.reduce(
    (acc, attr) => {
      const value =
        attr.value.stringValue ??
        attr.value.intValue ??
        attr.value.boolValue ??
        null
      if (value !== null) {
        acc[attr.key] = value
      }
      return acc
    },
    {} as Record<string, string | number | boolean>,
  )
}

function convertOtlpSpanKind({ kind }: { kind: number }): SpanKind {
  const kinds = {
    0: 'internal', // SPAN_KIND_UNSPECIFIED
    1: 'server', // SPAN_KIND_SERVER
    2: 'client', // SPAN_KIND_CLIENT
    3: 'producer', // SPAN_KIND_PRODUCER
    4: 'consumer', // SPAN_KIND_CONSUMER
  }
  return (kinds[kind as keyof typeof kinds] as SpanKind) || SpanKind.Internal
}

function convertOtlpStatus({
  status,
}: {
  status?: { code: number; message?: string }
}): {
  status?: string
  statusMessage?: string
} {
  if (!status) return {}

  const statusMap = {
    0: undefined, // UNSET
    1: 'ok', // OK
    2: 'error', // ERROR
  }

  return {
    status: statusMap[status.code as keyof typeof statusMap],
    statusMessage: status.message,
  }
}

// Generation Span Processing
// ----------------------------------------

function processGenerationSpan(
  span: OtlpSpan,
): Partial<typeof spans.$inferInsert> {
  const attrs = convertOtlpAttributes({ attributes: span.attributes })
  const { input, output } = extractInputOutput(attrs)
  if (!input.length || !output.length) return {}

  const modelParameters = extractModelParameters(attrs)
  const model = extractModel(attrs)
  const provider = extractProvider(model as string)
  const usage = extractUsage(attrs)
  const costs = provider
    ? calculateCosts({ usage, provider, model: model as string })
    : {}
  const toolCalls = extractFunctions(attrs)

  return {
    internalType: 'generation',
    model: model as string,
    modelParameters:
      Object.keys(modelParameters).length > 0
        ? JSON.stringify(modelParameters)
        : null,
    input: input.length > 0 ? input : undefined,
    output: output.length > 0 ? output : undefined,
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: parseInt(attrs['llm.usage.total_tokens'] as string) || 0,
    tools: toolCalls.length > 0 ? toolCalls : null,
    ...costs,
  }
}

// Generation Attribute Processing
// ----------------------------------------

function extractModelParameters(
  attrs: Record<string, string | number | boolean>,
) {
  return Object.entries(attrs)
    .filter(
      ([key, value]) =>
        key.startsWith('gen_ai.request.') &&
        key !== 'gen_ai.request.model' &&
        value !== undefined,
    )
    .reduce(
      (acc, [key, value]) => {
        const paramName = key.replace('gen_ai.request.', '')
        acc[paramName] = value
        return acc
      },
      {} as Record<string, any>,
    )
}

function extractUsage(attrs: Record<string, string | number | boolean>) {
  return {
    promptTokens: parseInt(attrs['gen_ai.usage.prompt_tokens'] as string) || 0,
    completionTokens:
      parseInt(attrs['gen_ai.usage.completion_tokens'] as string) || 0,
    totalTokens: parseInt(attrs['gen_ai.usage.total_tokens'] as string) || 0,
  }
}

function extractModel(attrs: Record<string, string | number | boolean>) {
  return attrs['gen_ai.request.model']
}

function extractProvider(model: string | undefined) {
  if (!model) return undefined

  const [provider] =
    Object.entries(PROVIDER_MODELS).find(([_, models]) => {
      const found = models[model]
      if (found) return true

      return false
    }) || []

  return provider as Providers
}

// Utility Functions
// ----------------------------------------

function calculateCosts({
  usage,
  provider,
  model,
}: {
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  provider: Providers
  model: string
}) {
  const totalCost = estimateCost({ usage, provider, model })
  if (!totalCost) return {}

  const costInMillicents = Math.round(totalCost * 100_000)

  return {
    inputCostInMillicents: Math.round(
      (costInMillicents * usage.promptTokens) /
        (usage.promptTokens + usage.completionTokens),
    ),
    outputCostInMillicents: Math.round(
      (costInMillicents * usage.completionTokens) /
        (usage.promptTokens + usage.completionTokens),
    ),
    totalCostInMillicents: costInMillicents,
  }
}

function extractFunctions(
  attrs: Record<string, string | number | boolean>,
): ToolCall[] {
  const functionAttrs = Object.entries(attrs).filter(([key]) =>
    key.startsWith('llm.request.functions.'),
  )

  const groupedFunctions = functionAttrs.reduce(
    (acc, [key, value]) => {
      const [, , , index, field] = key.split('.')
      if (!index || !field) {
        return acc
      }

      if (!acc[index]) {
        acc[index] = {}
      }

      acc[index][field] = value
      return acc
    },
    {} as Record<string, Record<string, string | number | boolean>>,
  )

  return Object.entries(groupedFunctions).map(([index, func]) => {
    let args: Record<string, unknown> = {}
    try {
      if (func.arguments && typeof func.arguments === 'string') {
        args = JSON.parse(func.arguments)
      }
    } catch (e) {
      // If JSON parsing fails, use the raw string
      args = { raw: func.arguments }
    }

    return {
      id: `function_${index}`,
      name: func.name as string,
      description: func.description as string | undefined,
      arguments: args,
    }
  })
}

function extractLatitudeAttrs(attributes: Record<string, unknown>) {
  const latitudeAttrs: LatitudeAttrs = {
    distinctId: attributes['latitude.distinctId'] as string | undefined,
    commitUuid: attributes['latitude.versionUuid'] as string | undefined,
    metadata: undefined,
    documentUuid: undefined,
    parameters: undefined,
  }

  if (attributes['latitude.prompt']) {
    try {
      const promptData = JSON.parse(
        attributes['latitude.prompt'] as string,
      ) as {
        uuid: string
        versionUuid: string | undefined
        parameters: Record<string, unknown> | undefined
      }

      latitudeAttrs.documentUuid = promptData.uuid
      latitudeAttrs.commitUuid = promptData.versionUuid
      latitudeAttrs.parameters = promptData.parameters
    } catch (e) {
      // do nothing
    }
  }

  if (attributes['latitude.metadata']) {
    try {
      latitudeAttrs.metadata = JSON.parse(
        attributes['latitude.metadata'] as string,
      )
    } catch (e) {
      // do nothing
    }
  }

  return latitudeAttrs
}
