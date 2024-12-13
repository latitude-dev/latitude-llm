import { BulkCreateTracesAndSpansEvent } from '../events'
import { setupJobs } from '../../jobs'
import { database } from '../../client'
import { and, eq, inArray } from 'drizzle-orm'
import { spans as spansModel } from '../../schema'

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

  const spansToImport = spansLinkedToPrompts.flatMap((span) =>
    generationSpans
      .filter((s) => s.traceId === span.traceId)
      .map((s) => ({
        workspaceId,
        span: s,
        prompt: {
          documentUuid: span.documentUuid,
          commitUuid: span.commitUuid,
          parameters: span.parameters,
        },
        distinctId: span.distinctId,
      })),
  )
  if (!spansToImport.length) return

  const jobs = await setupJobs()
  spansToImport.forEach(async (data) => {
    jobs.defaultQueue.jobs.enqueueCreateDocumentLogFromSpanJob({
      ...data,
    })
  })
}
