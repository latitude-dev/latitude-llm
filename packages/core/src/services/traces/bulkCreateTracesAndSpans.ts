import { inArray } from 'drizzle-orm'

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
    modelParameters?: unknown | null
    input?: unknown | null
    output?: unknown | null
    inputTokens?: number | null
    outputTokens?: number | null
    totalTokens?: number | null
    inputCostInMillicents?: number | null
    outputCostInMillicents?: number | null
    totalCostInMillicents?: number | null
  }>
  skipExistingTraces?: boolean
}

export async function bulkCreateTracesAndSpans(
  {
    project,
    traces: tracesToCreate,
    spans: spansToCreate,
    skipExistingTraces,
  }: BulkCreateTracesAndSpansProps,
  db = database,
) {
  // First, find existing traces outside the transaction
  let existingTraceIds = new Set<string>()
  if (tracesToCreate.length > 0) {
    const existingTraces = await db.query.traces.findMany({
      where: inArray(
        traces.traceId,
        tracesToCreate.map((t) => t.traceId),
      ),
    })
    existingTraceIds = new Set(existingTraces.map((t) => t.traceId))
  }

  // Filter out traces that already exist if skipExistingTraces is true
  const tracesToInsert = skipExistingTraces
    ? tracesToCreate.filter((trace) => !existingTraceIds.has(trace.traceId))
    : tracesToCreate

  return Transaction.call(async (tx) => {
    // Create new traces if any
    let createdTraces: (typeof traces.$inferSelect)[] = []
    if (tracesToInsert.length > 0) {
      createdTraces = await tx
        .insert(traces)
        .values(
          tracesToInsert.map((trace) => ({
            projectId: project.id,
            traceId: trace.traceId,
            name: trace.name,
            startTime: trace.startTime,
            endTime: trace.endTime,
            attributes: trace.attributes,
            status: trace.status,
          })),
        )
        // If the trace already exists we do a noop. This can happen as
        // atomicity is not guaranteed (two traces can try to get created at the
        // same time).
        .onConflictDoUpdate({
          target: [traces.traceId],
          set: {
            updatedAt: new Date(),
          },
        })
        .returning()
    }

    // Get all valid trace IDs (both existing and newly created)
    const validTraceIds = new Set([
      ...existingTraceIds,
      ...createdTraces.map((t) => t.traceId),
    ])

    // Filter spans to only include those associated with valid traces
    const validSpans = spansToCreate.filter((span) =>
      validTraceIds.has(span.traceId),
    )

    // Create all valid spans
    const createdSpans = await tx
      .insert(spans)
      .values(
        validSpans.map((span) => ({
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
