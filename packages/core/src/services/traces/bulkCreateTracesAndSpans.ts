import { Project } from '../../browser'
import { database } from '../../client'
import { SpanKind } from '../../constants'
import { Result, Transaction } from '../../lib'
import { spans } from '../../schema/models/spans'
import { traces } from '../../schema/models/traces'

export type BulkCreateTracesAndSpansProps = {
  project: Project
  traces: Array<{
    traceId: string
    name?: string
    startTime: Date
    endTime?: Date
    attributes?: Record<string, string | number | boolean>
    status?: string
  }>
  spans: Array<{
    traceId: string
    spanId: string
    parentSpanId?: string | null
    name: string
    kind: SpanKind
    startTime: Date
    endTime?: Date | null
    attributes?: Record<string, string | number | boolean> | null
    status?: string | null
    statusMessage?: string | null
    events?: Array<{
      name: string
      timestamp: string
      attributes?: Record<string, string | number | boolean>
    }> | null
    links?: Array<{
      traceId: string
      spanId: string
      attributes?: Record<string, string | number | boolean>
    }> | null
    internalType?: 'generation' | null
    model?: string | null
    modelParameters?: string | null
    input?: string | null
    output?: string | null
    inputTokens?: number | null
    outputTokens?: number | null
    totalTokens?: number | null
    inputCostInMillicents?: number | null
    outputCostInMillicents?: number | null
    totalCostInMillicents?: number | null
  }>
}

export async function bulkCreateTracesAndSpans(
  {
    project,
    traces: tracesToCreate,
    spans: spansToCreate,
  }: BulkCreateTracesAndSpansProps,
  db = database,
) {
  return Transaction.call(async (tx) => {
    // Create all traces first
    const createdTraces = await tx
      .insert(traces)
      .values(
        tracesToCreate.map((trace) => ({
          projectId: project.id,
          traceId: trace.traceId,
          name: trace.name,
          startTime: trace.startTime,
          endTime: trace.endTime,
          attributes: trace.attributes,
          status: trace.status,
        })),
      )
      .returning()

    // Then create all spans
    const createdSpans = await tx
      .insert(spans)
      .values(
        spansToCreate.map((span) => ({
          traceId: span.traceId,
          spanId: span.spanId,
          parentSpanId: span.parentSpanId,
          name: span.name,
          kind: span.kind,
          startTime: span.startTime,
          endTime: span.endTime,
          attributes: span.attributes,
          status: span.status,
          statusMessage: span.statusMessage,
          events: span.events,
          links: span.links,
          internalType: span.internalType,
          model: span.model,
          modelParameters: span.modelParameters,
          input: span.input,
          output: span.output,
          inputTokens: span.inputTokens,
          outputTokens: span.outputTokens,
          totalTokens: span.totalTokens,
          inputCostInMillicents: span.inputCostInMillicents,
          outputCostInMillicents: span.outputCostInMillicents,
          totalCostInMillicents: span.totalCostInMillicents,
        })),
      )
      .returning()

    return Result.ok({
      traces: createdTraces,
      spans: createdSpans,
    })
  }, db)
}
