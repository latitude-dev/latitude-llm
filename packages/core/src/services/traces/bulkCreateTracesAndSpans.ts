import { eq, inArray, sql } from 'drizzle-orm'

import { Workspace } from '../../browser'
import { Database, database } from '../../client'
import { SpanKind, SpanMetadataTypes } from '../../constants'
import { publisher } from '../../events/publisher'
import { Result, Transaction } from '../../lib'
import { spans } from '../../schema/models/spans'
import { traces } from '../../schema/models/traces'
import type { Message, ToolCall } from '@latitude-data/compiler'

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
  const [existingTraceIds] = await Promise.all([
    findExistingTraces(tracesToCreate, db),
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

    const spans = await createSpans(spansToCreate, tx)

    // Handle spans
    const allTraces = [...createdTraces, ...updatedTraces]

    publisher.publishLater({
      type: 'bulkCreateTracesAndSpans',
      data: {
        workspaceId: workspace.id,
        traces: allTraces,
        spans,
      },
    })

    return Result.ok({
      traces: allTraces,
      spans,
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
  modelParameters?: Record<string, unknown> | null
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

async function createSpans(spansToInsert: SpanInput[], tx: Database) {
  if (spansToInsert.length === 0) return []

  return tx
    .insert(spans)
    .values(spansToInsert)
    .onConflictDoUpdate({
      target: [spans.spanId, spans.traceId],
      set: {
        // Merge JSON object fields
        attributes: sql`
          CASE 
            WHEN ${spans.attributes} IS NULL THEN EXCLUDED.attributes
            WHEN EXCLUDED.attributes IS NULL THEN ${spans.attributes}
            ELSE ${spans.attributes} || EXCLUDED.attributes
          END
        `,
        metadata: sql`
          CASE 
            WHEN ${spans.metadata} IS NULL THEN EXCLUDED.metadata
            WHEN EXCLUDED.metadata IS NULL THEN ${spans.metadata}
            ELSE ${spans.metadata} || EXCLUDED.metadata
          END
        `,
        modelParameters: sql`
          CASE 
            WHEN ${spans.modelParameters} IS NULL THEN EXCLUDED.model_parameters
            WHEN EXCLUDED.model_parameters IS NULL THEN ${spans.modelParameters}
            ELSE ${spans.modelParameters} || EXCLUDED.model_parameters
          END
        `,
        parameters: sql`
          CASE 
            WHEN ${spans.parameters} IS NULL THEN EXCLUDED.parameters
            WHEN EXCLUDED.parameters IS NULL THEN ${spans.parameters}
            ELSE ${spans.parameters} || EXCLUDED.parameters
          END
        `,
        // Merge array fields
        tools: sql`
          CASE
            WHEN ${spans.tools} IS NULL THEN EXCLUDED.tools
            WHEN EXCLUDED.tools IS NULL THEN ${spans.tools}
            ELSE (
              SELECT jsonb_agg(DISTINCT element)
              FROM jsonb_array_elements(
                (COALESCE(${spans.tools}, '[]'::jsonb) || COALESCE(EXCLUDED.tools, '[]'::jsonb))
              ) AS element
            )
          END
        `,
        events: sql`
          CASE
            WHEN ${spans.events} IS NULL THEN EXCLUDED.events
            WHEN EXCLUDED.events IS NULL THEN ${spans.events}
            ELSE (
              SELECT jsonb_agg(DISTINCT element)
              FROM jsonb_array_elements(
                (COALESCE(${spans.events}, '[]'::jsonb) || COALESCE(EXCLUDED.events, '[]'::jsonb))
              ) AS element
            )
          END
        `,
        links: sql`
          CASE
            WHEN ${spans.links} IS NULL THEN EXCLUDED.links
            WHEN EXCLUDED.links IS NULL THEN ${spans.links}
            ELSE (
              SELECT jsonb_agg(DISTINCT element)
              FROM jsonb_array_elements(
                (COALESCE(${spans.links}, '[]'::jsonb) || COALESCE(EXCLUDED.links, '[]'::jsonb))
              ) AS element
            )
          END
        `,
        // Other fields are not merged unless they were null
        name: sql`COALESCE(${spans.name}, EXCLUDED.name)`,
        kind: sql`COALESCE(${spans.kind}, EXCLUDED.kind)`,
        startTime: sql`COALESCE(${spans.startTime}, EXCLUDED.start_time)`,
        endTime: sql`COALESCE(${spans.endTime}, EXCLUDED.end_time)`,
        status: sql`COALESCE(${spans.status}, EXCLUDED.status)`,
        statusMessage: sql`COALESCE(${spans.statusMessage}, EXCLUDED.status_message)`,
        internalType: sql`COALESCE(${spans.internalType}, EXCLUDED.internal_type)`,
        model: sql`COALESCE(${spans.model}, EXCLUDED.model)`,
        input: sql`COALESCE(${spans.input}, EXCLUDED.input)`,
        output: sql`COALESCE(${spans.output}, EXCLUDED.output)`,
        documentUuid: sql`COALESCE(${spans.documentUuid}, EXCLUDED.document_uuid)`,
        distinctId: sql`COALESCE(${spans.distinctId}, EXCLUDED.distinct_id)`,
        commitUuid: sql`COALESCE(${spans.commitUuid}, EXCLUDED.commit_uuid)`,
        // Merge numeric fields if they are different than 0 (the default value)
        inputTokens: sql`
          CASE
            WHEN ${spans.inputTokens} = 0 AND EXCLUDED.input_tokens IS NOT NULL AND EXCLUDED.input_tokens != 0
            THEN EXCLUDED.input_tokens
            ELSE ${spans.inputTokens}
          END
        `,
        outputTokens: sql`
          CASE
            WHEN ${spans.outputTokens} = 0 AND EXCLUDED.output_tokens IS NOT NULL AND EXCLUDED.output_tokens != 0
            THEN EXCLUDED.output_tokens
            ELSE ${spans.outputTokens}
          END
        `,
        totalTokens: sql`
          CASE
            WHEN ${spans.totalTokens} = 0 AND EXCLUDED.total_tokens IS NOT NULL AND EXCLUDED.total_tokens != 0
            THEN EXCLUDED.total_tokens
            ELSE ${spans.totalTokens}
          END
        `,
        inputCostInMillicents: sql`
          CASE
            WHEN ${spans.inputCostInMillicents} = 0 AND EXCLUDED.input_cost_in_millicents IS NOT NULL AND EXCLUDED.input_cost_in_millicents != 0
            THEN EXCLUDED.input_cost_in_millicents
            ELSE ${spans.inputCostInMillicents}
          END
        `,
        outputCostInMillicents: sql`
          CASE
            WHEN ${spans.outputCostInMillicents} = 0 AND EXCLUDED.output_cost_in_millicents IS NOT NULL AND EXCLUDED.output_cost_in_millicents != 0
            THEN EXCLUDED.output_cost_in_millicents
            ELSE ${spans.outputCostInMillicents}
          END
        `,
        totalCostInMillicents: sql`
          CASE
            WHEN ${spans.totalCostInMillicents} = 0 AND EXCLUDED.total_cost_in_millicents IS NOT NULL AND EXCLUDED.total_cost_in_millicents != 0
            THEN EXCLUDED.total_cost_in_millicents
            ELSE ${spans.totalCostInMillicents}
          END
        `,
        updatedAt: new Date(),
      },
    })
    .returning()
}
