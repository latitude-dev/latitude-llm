// Move OtlpSpan, ResourceSpan types and helper functions
// (convertOtlpAttributes, convertOtlpSpanKind, convertOtlpStatus, processGenerationSpan, processSpan)
// to this new file so they can be shared between the handler and job

import { Providers, SpanKind } from '../../constants'
import { spans } from '../../schema'
import { estimateCost } from '../ai'

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
  // Based on OpenTelemetry SpanKind enum
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

  // Based on OpenTelemetry StatusCode
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

function processGenerationSpan(
  span: OtlpSpan,
): Partial<typeof spans.$inferInsert> {
  const attrs = convertOtlpAttributes({ attributes: span.attributes })

  // Check if this is a generation span
  if (!attrs['gen_ai.system'] || !attrs['llm.request.type']) return {}

  const provider = extractProvider(attrs)
  if (!provider) return {}

  const model = extractModel(attrs)
  const { input, output } = extractInputOutput(attrs)
  const modelParameters = extractModelParameters(attrs)
  const usage = extractUsage(attrs)
  const costs = calculateCosts({ usage, provider, model: model as string })

  return {
    internalType: 'generation',
    model: model as string,
    modelParameters:
      Object.keys(modelParameters).length > 0
        ? JSON.stringify(modelParameters)
        : null,
    input: input.length > 0 ? JSON.stringify(input) : null,
    output: output.length > 0 ? JSON.stringify(output) : null,
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: parseInt(attrs['llm.usage.total_tokens'] as string) || 0,
    ...costs,
  }
}

export function processSpan({ span }: { span: OtlpSpan }) {
  const startTime = new Date(parseInt(span.startTimeUnixNano) / 1_000_000)
  const endTime = span.endTimeUnixNano
    ? new Date(parseInt(span.endTimeUnixNano) / 1_000_000)
    : undefined

  const { status, statusMessage } = convertOtlpStatus({ status: span.status })

  return {
    traceId: span.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    name: span.name,
    kind: convertOtlpSpanKind({ kind: span.kind }),
    startTime,
    endTime,
    attributes: convertOtlpAttributes({ attributes: span.attributes }),
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
    // Add generation-specific fields
    ...processGenerationSpan(span),
  }
}

function extractInputOutput(attrs: Record<string, string | number | boolean>) {
  // Collect all prompts and format them as OpenAI messages
  const prompts: Array<{ role: string; content: unknown }> = []
  const completions: Array<{
    role: string
    content?: unknown
    toolCalls?: unknown
  }> = []

  // Get all attribute keys
  Object.entries(attrs).forEach(([key, value]) => {
    // Handle prompts
    if (key.startsWith('gen_ai.prompt.') && key.endsWith('.content')) {
      const parts = key.split('.')
      if (parts[2]) {
        // Check if index part exists
        const index = parseInt(parts[2])
        const role = attrs[`gen_ai.prompt.${index}.role`] as string
        const content = tryParseJSON(value as string)
        prompts[index] = { role, content }
      }
    }
    // Handle completions
    if (
      key.startsWith('gen_ai.completion.') &&
      (key.endsWith('.content') || key.endsWith('.tool_calls'))
    ) {
      const parts = key.split('.')
      if (parts[2]) {
        const index = parseInt(parts[2])
        const role = attrs[`gen_ai.completion.${index}.role`] as string

        if (key.endsWith('.tool_calls')) {
          const toolCalls = tryParseJSON(value as string)
          completions[index] = { role, toolCalls }
        } else if (key.endsWith('.content')) {
          const content = tryParseJSON(value as string)
          completions[index] = { role, content }
        }
      }
    }
  })

  // Filter out any undefined entries and create final arrays
  const input = prompts.filter(Boolean)
  const output = completions.filter(Boolean)

  return { input, output }
}

// Helper function to try parsing JSON content
function tryParseJSON(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

function extractModel(attrs: Record<string, string | number | boolean>) {
  return attrs['gen_ai.response.model'] || attrs['gen_ai.request.model']
}

function extractProvider(attrs: Record<string, string | number | boolean>) {
  // Map provider names to our enum
  const providerMap: Record<string, Providers> = {
    OpenAI: Providers.OpenAI,
    'openai.chat': Providers.OpenAI,
    Anthropic: Providers.Anthropic,
    Groq: Providers.Groq,
    Mistral: Providers.Mistral,
    Google: Providers.Google,
  }

  const provider = providerMap[attrs['gen_ai.system'] as string]
  if (!provider) return undefined

  return provider
}
