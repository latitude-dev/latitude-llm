import { BulkCreateTracesAndSpansEvent } from '../events'
import { database } from '../../client'
import { and, eq, inArray } from 'drizzle-orm'
import { spans as spansModel } from '../../schema'
import { defaultQueue } from '../../jobs/queues'

export async function createDocumentLogsFromSpansJob({
  data: event,
}: {
  data: BulkCreateTracesAndSpansEvent
}) {
  const { workspaceId, spans } = event.data
  const spansLinkedToPrompts = spans.filter((span) => !!span.documentUuid)
  if (!spansLinkedToPrompts.length) return

  const generationSpans = await database
    .select()
    .from(spansModel)
    .where(
      and(
        inArray(
          spansModel.traceId,
          spansLinkedToPrompts.map((s) => s.traceId),
        ),
        eq(spansModel.internalType, 'generation'),
      ),
    )
    .execute()

  const spansToImport = spansLinkedToPrompts.flatMap((latitudeSpan) =>
    generationSpans
      .filter((s) => s.traceId === latitudeSpan.traceId)
      .map((s) => ({
        span: {
          ...s,
          documentUuid: latitudeSpan.documentUuid,
          commitUuid: latitudeSpan.commitUuid,
          parameters: latitudeSpan.parameters,
          distinctId: latitudeSpan.distinctId,
        },
        workspaceId,
      })),
  )
  if (!spansToImport.length) return

  spansToImport.forEach(async (data) => {
    defaultQueue.add('createDocumentLogFromSpanJob', {
      ...data,
    })
  })
}
