import { database } from '../../client'
import { SpanKind, SpanMetadataTypes } from '../../constants'
import { Result, Transaction } from '../../lib'
import { spans } from '../../schema/models/spans'

export type CreateSpanProps = {
  traceId: string
  spanId: string
  parentSpanId?: string
  name: string
  kind: SpanKind
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
  metadataType?: SpanMetadataTypes
  metadataId: number
}

export async function createSpan(
  {
    traceId,
    spanId,
    parentSpanId,
    name,
    kind,
    startTime,
    endTime,
    attributes,
    status,
    statusMessage,
    events,
    links,
    metadataType,
  }: CreateSpanProps,
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(spans)
      .values([
        {
          traceId,
          spanId,
          parentSpanId,
          name,
          kind,
          startTime,
          endTime,
          attributes,
          status,
          statusMessage,
          events,
          links,
          internalType: metadataType,
        },
      ])
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
