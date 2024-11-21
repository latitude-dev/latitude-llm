import { database } from '../../client'
import { SpanMetadataTypes } from '../../constants'
import { Result, Transaction } from '../../lib'
import { spans } from '../../schema/models/spans'

export type BulkCreateSpanProps = {
  spans: Array<{
    traceId: string
    spanId: string
    parentSpanId?: string
    name: string
    kind: 'internal' | 'server' | 'client' | 'producer' | 'consumer'
    startTime: Date
    endTime?: Date
    attributes?: Record<string, string | number | boolean>
    status?: string
    statusMessage?: string
    events?: Array<{
      name: string
      timestamp: string
      attributes?: Record<string, string | number | boolean>
    }>
    links?: Array<{
      traceId: string
      spanId: string
      attributes?: Record<string, string | number | boolean>
    }>
    metadataType: SpanMetadataTypes
    metadataId: number
  }>
}

export async function bulkCreateSpans(
  { spans: spansToCreate }: BulkCreateSpanProps,
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
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
          metadataType: span.metadataType,
          metadataId: span.metadataId,
        })),
      )
      .returning()

    return Result.ok(result)
  }, db)
}
