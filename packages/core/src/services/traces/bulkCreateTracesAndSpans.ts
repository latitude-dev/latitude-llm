import { eq, inArray, sql } from 'drizzle-orm'

import { Workspace } from '../../browser'
import { Database, database } from '../../client'
import { SpanKind, SpanMetadataTypes } from '../../constants'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { spans } from '../../schema/models/spans'
import { traces } from '../../schema/models/traces'
import { Message, ToolCall } from '@latitude-data/compiler'

export type BulkCreateTracesAndSpansProps = {
  workspace: Workspace
  traces: TraceInput[]
  spans: SpanInput[]
}

export async function bulkCreateTracesAndSpans(
  {
    workspace,
    traces: tracesToCreate,
    spans: spansToCreate,
  }: BulkCreateTracesAndSpansProps,
  db = database,
) {
  // Find existing traces and spans outside the transaction
  const [existingTraceIds, existingSpanIds] = await Promise.all([
    findExistingTraces(tracesToCreate, db),
    findExistingSpans(spansToCreate, db),
  ])

  // Split items into create and update operations
  const tracesToInsert = tracesToCreate.filter(
    (t) => !existingTraceIds.has(t.traceId),
  )
  const tracesToUpdate = tracesToCreate.filter((t) =>
    existingTraceIds.has(t.traceId),
  )

  return Transaction.call(async (tx) => {
    // Handle traces
    const [createdTraces, updatedTraces] = await Promise.all([
      createTraces({ workspace, tracesToInsert }, tx),
      updateTraces(tracesToUpdate, tx),
    ])

    // Get all valid trace IDs
    const validTraceIds = new Set([
      ...existingTraceIds,
      ...createdTraces.map((t) => t.traceId),
    ])

    // Filter and split spans
    const validSpans = spansToCreate.filter((span) =>
      validTraceIds.has(span.traceId),
    )
    const spansToInsert = validSpans.filter(
      (s) => !existingSpanIds.has(s.spanId),
    )
    const spansToUpdate = validSpans.filter((s) =>
      existingSpanIds.has(s.spanId),
    )

    // Handle spans
    const [createdSpans, updatedSpans] = await Promise.all([
      createSpans(spansToInsert, tx),
      updateSpans(spansToUpdate, tx),
    ])

    const allTraces = [...createdTraces, ...updatedTraces]
    const allSpans = [...createdSpans, ...updatedSpans]

    publisher.publishLater({
      type: 'bulkCreateTracesAndSpans',
      data: {
        workspaceId: workspace.id,
        traces: allTraces,
        spans: allSpans,
      },
    })

    return Result.ok({
      traces: allTraces,
      spans: allSpans,
    })
  }, db)
}

type SpanInput = {
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
  tools?: Array<ToolCall> | null
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
  internalType?: SpanMetadataTypes | null
  model?: string | null
  modelParameters?: unknown | null
  input?: Message[] | null
  output?: Message[] | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  inputCostInMillicents?: number | null
  outputCostInMillicents?: number | null
  totalCostInMillicents?: number | null
  metadata?: Record<string, string | number | boolean> | null
  documentUuid?: string | null
  parameters?: Record<string, string | number | boolean> | null
  distinctId?: string | null
  commitUuid?: string | null
}

type TraceInput = {
  traceId: string
  name?: string
  startTime: Date
  endTime?: Date
  attributes?: Record<string, string | number | boolean>
  status?: string
}

async function findExistingTraces(tracez: TraceInput[], db: Database) {
  if (tracez.length === 0) return new Set<string>()

  const existingTraces = await db.query.traces.findMany({
    where: inArray(
      traces.traceId,
      tracez.map((t) => t.traceId),
    ),
  })

  return new Set(existingTraces.map((t) => t.traceId))
}

async function findExistingSpans(spanz: SpanInput[], db: Database) {
  if (spanz.length === 0) return new Set<string>()

  const existingSpans = await db.query.spans.findMany({
    where: inArray(
      spans.spanId,
      spanz.map((s) => s.spanId),
    ),
  })

  return new Set(existingSpans.map((s) => s.spanId))
}

async function updateTraces(tracesToUpdate: TraceInput[], tx: Database) {
  const updatedTraces: (typeof traces.$inferSelect)[] = []

  for (const trace of tracesToUpdate) {
    const updated = await tx
      .update(traces)
      .set({
        startTime: trace.startTime,
        endTime: trace.endTime,
        attributes: trace.attributes,
        status: trace.status,
      })
      .where(eq(traces.traceId, trace.traceId))
      .returning()
    updatedTraces.push(updated[0]!)
  }

  return updatedTraces
}

async function createTraces(
  {
    workspace,
    tracesToInsert,
  }: {
    workspace: Workspace
    tracesToInsert: TraceInput[]
  },
  tx: Database,
) {
  if (tracesToInsert.length === 0) return []

  return tx
    .insert(traces)
    .values(
      tracesToInsert.map((trace) => ({
        workspaceId: workspace.id,
        traceId: trace.traceId,
        name: trace.name,
        startTime: trace.startTime,
        endTime: trace.endTime,
        attributes: trace.attributes,
        status: trace.status,
      })),
    )
    .onConflictDoUpdate({
      target: [traces.traceId],
      set: {
        updatedAt: new Date(),
      },
    })
    .returning()
}

async function updateSpans(spansToUpdate: SpanInput[], tx: Database) {
  const updatedSpans: (typeof spans.$inferSelect)[] = []

  for (const span of spansToUpdate) {
    const updated = await tx
      .update(spans)
      .set({
        ...span,
        // Exclude traceId and spanId as they're part of the primary key
        traceId: undefined,
        spanId: undefined,
      })
      .where(eq(spans.spanId, span.spanId))
      .returning()
    updatedSpans.push(updated[0]!)
  }

  return updatedSpans
}

async function createSpans(spansToInsert: SpanInput[], tx: Database) {
  if (spansToInsert.length === 0) return []

  const updateSet: Record<string, unknown> = {
    parentSpanId: sql`EXCLUDED.parent_span_id`,
    name: sql`EXCLUDED.name`,
    kind: sql`EXCLUDED.kind`,
    startTime: sql`EXCLUDED.start_time`,
    endTime: sql`EXCLUDED.end_time`,
    attributes: sql`EXCLUDED.attributes`,
    status: sql`EXCLUDED.status`,
    statusMessage: sql`EXCLUDED.status_message`,
    events: sql`EXCLUDED.events`,
    links: sql`EXCLUDED.links`,
    internalType: sql`EXCLUDED.internal_type`,
    model: sql`EXCLUDED.model`,
    modelParameters: sql`EXCLUDED.model_parameters`,
    input: sql`EXCLUDED.input`,
    output: sql`EXCLUDED.output`,
    tools: sql`EXCLUDED.tools`,
    metadata: sql`EXCLUDED.metadata`,
    documentUuid: sql`EXCLUDED.document_uuid`,
    parameters: sql`EXCLUDED.parameters`,
    distinctId: sql`EXCLUDED.distinct_id`,
    commitUuid: sql`EXCLUDED.commit_uuid`,
    updatedAt: new Date(),
  }

  return tx
    .insert(spans)
    .values(spansToInsert)
    .onConflictDoUpdate({
      target: [spans.spanId],
      set: updateSet,
    })
    .returning()
}
