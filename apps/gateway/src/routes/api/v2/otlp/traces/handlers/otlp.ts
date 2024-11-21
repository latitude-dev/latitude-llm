import { chunk } from 'lodash-es'

import { zValidator } from '@hono/zod-validator'
import { Project, Providers, SpanKind } from '@latitude-data/core/browser'
import { ProjectsRepository } from '@latitude-data/core/repositories'
import { spans } from '@latitude-data/core/schema'
import { estimateCost } from '@latitude-data/core/services/ai/index'
import { bulkCreateTracesAndSpans } from '@latitude-data/core/services/traces/bulkCreateTracesAndSpans'
import { Factory } from 'hono/factory'
import { z } from 'zod'

const factory = new Factory()

// OTLP schema based on OpenTelemetry specification
const otlpTraceSchema = z.object({
  projectId: z.number(),
  resourceSpans: z.array(
    z.object({
      resource: z.object({
        attributes: z.array(
          z.object({
            key: z.string(),
            value: z.object({
              stringValue: z.string().optional(),
              intValue: z.number().optional(),
              boolValue: z.boolean().optional(),
            }),
          }),
        ),
      }),
      scopeSpans: z.array(
        z.object({
          spans: z.array(
            z.object({
              traceId: z.string(),
              spanId: z.string(),
              parentSpanId: z.string().optional(),
              name: z.string(),
              kind: z.number(), // SpanKind enum in OTLP
              startTimeUnixNano: z.string(),
              endTimeUnixNano: z.string().optional(),
              attributes: z
                .array(
                  z.object({
                    key: z.string(),
                    value: z.object({
                      stringValue: z.string().optional(),
                      intValue: z.number().optional(),
                      boolValue: z.boolean().optional(),
                    }),
                  }),
                )
                .optional(),
              status: z
                .object({
                  code: z.number(),
                  message: z.string().optional(),
                })
                .optional(),
              events: z
                .array(
                  z.object({
                    timeUnixNano: z.string(),
                    name: z.string(),
                    attributes: z
                      .array(
                        z.object({
                          key: z.string(),
                          value: z.object({
                            stringValue: z.string().optional(),
                            intValue: z.number().optional(),
                            boolValue: z.boolean().optional(),
                          }),
                        }),
                      )
                      .optional(),
                  }),
                )
                .optional(),
              links: z
                .array(
                  z.object({
                    traceId: z.string(),
                    spanId: z.string(),
                    attributes: z
                      .array(
                        z.object({
                          key: z.string(),
                          value: z.object({
                            stringValue: z.string().optional(),
                            intValue: z.number().optional(),
                            boolValue: z.boolean().optional(),
                          }),
                        }),
                      )
                      .optional(),
                  }),
                )
                .optional(),
            }),
          ),
        }),
      ),
    }),
  ),
})

type OtlpSpan = {
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

type ResourceSpan = {
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

const BATCH_SIZE = 50 // Adjust based on your needs

async function processBatch({
  spans,
  project,
}: {
  spans: {
    span: OtlpSpan
    resourceAttributes: ResourceSpan['resource']['attributes']
  }[]
  project: Project
}) {
  // Group spans by traceId for efficient trace creation
  const traceGroups = spans.reduce(
    (acc, { span, resourceAttributes }) => {
      const key = span.traceId
      if (!acc[key]) {
        acc[key] = {
          traceId: span.traceId,
          startTime: new Date(parseInt(span.startTimeUnixNano) / 1_000_000),
          endTime: span.endTimeUnixNano
            ? new Date(parseInt(span.endTimeUnixNano) / 1_000_000)
            : undefined,
          attributes: convertOtlpAttributes({ attributes: resourceAttributes }),
          spans: [],
        }
      }
      acc[key].spans.push(span)
      return acc
    },
    {} as Record<
      string,
      {
        traceId: string
        startTime: Date
        endTime?: Date
        attributes: Record<string, string | number | boolean>
        spans: OtlpSpan[]
      }
    >,
  )

  // Create all traces and spans in a single transaction
  await bulkCreateTracesAndSpans({
    project,
    traces: Object.values(traceGroups).map(
      ({ traceId, startTime, endTime, attributes }) => ({
        traceId,
        startTime,
        endTime,
        attributes,
      }),
    ),
    spans: spans.map(({ span }) => processSpan({ span })),
  })
}

function convertOtlpAttributes({
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

function processGenerationSpan(
  span: OtlpSpan,
): Partial<typeof spans.$inferInsert> {
  const attrs = convertOtlpAttributes({ attributes: span.attributes })

  // Check if this is a generation span
  if (!attrs['gen_ai.system'] || !attrs['llm.request.type']) {
    return {}
  }

  // Map provider names to our enum
  const providerMap: Record<string, Providers> = {
    OpenAI: Providers.OpenAI,
    Anthropic: Providers.Anthropic,
    Groq: Providers.Groq,
    Mistral: Providers.Mistral,
    Google: Providers.Google,
    // Add other providers as needed
  }

  const provider = providerMap[attrs['gen_ai.system'] as string]
  if (!provider) {
    return {}
  }

  // Extract model information
  const model = attrs['gen_ai.response.model'] || attrs['gen_ai.request.model']
  if (!model) {
    return {}
  }

  // Extract model parameters from request attributes
  const modelParameters = Object.entries(attrs)
    .filter(
      ([key, value]) =>
        key.startsWith('gen_ai.request.') &&
        key !== 'gen_ai.request.model' &&
        value !== undefined,
    )
    .reduce(
      (acc, [key, value]) => {
        // Remove the 'gen_ai.request.' prefix
        const paramName = key.replace('gen_ai.request.', '')
        acc[paramName] = value
        return acc
      },
      {} as Record<string, any>,
    )

  // Extract usage information
  const usage = {
    promptTokens: parseInt(attrs['gen_ai.usage.prompt_tokens'] as string) || 0,
    completionTokens:
      parseInt(attrs['gen_ai.usage.completion_tokens'] as string) || 0,
    totalTokens: parseInt(attrs['gen_ai.usage.total_tokens'] as string) || 0,
  }

  // Calculate costs
  const totalCost = estimateCost({ usage, provider, model: model as string })
  const costInMillicents = Math.round(totalCost * 100_000) // Convert to millicents

  // Extract input/output content
  const input = attrs['gen_ai.prompt.0.content'] as string | undefined
  const output = attrs['gen_ai.completion.0.content'] as string | undefined

  return {
    internalType: 'generation',
    model: model as string,
    modelParameters:
      Object.keys(modelParameters).length > 0
        ? JSON.stringify(modelParameters)
        : null,
    input,
    output,
    inputTokens: usage.promptTokens,
    outputTokens: usage.completionTokens,
    totalTokens: parseInt(attrs['llm.usage.total_tokens'] as string) || 0,
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

function processSpan({ span }: { span: OtlpSpan }) {
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

export const otlpTraceHandler = factory.createHandlers(
  zValidator('json', otlpTraceSchema),
  async (c) => {
    const body = c.req.valid('json')
    const workspace = c.get('workspace')
    const project = await new ProjectsRepository(workspace.id)
      .find(body.projectId)
      .then((result) => result.unwrap())

    // Flatten the spans array and include resource attributes
    const allSpans = body.resourceSpans.flatMap((resourceSpan) =>
      resourceSpan.scopeSpans.flatMap((scopeSpan) =>
        scopeSpan.spans.map((span) => ({
          span,
          resourceAttributes: resourceSpan.resource.attributes,
        })),
      ),
    )

    // Process spans in batches
    const batches = chunk(allSpans, BATCH_SIZE)
    await Promise.all(
      batches.map((batch) => processBatch({ spans: batch, project })),
    )

    return c.json({ status: 'ok' })
  },
)
