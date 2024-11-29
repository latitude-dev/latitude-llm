import { BulkCreateTracesAndSpansEvent } from '../events'
import { unsafelyFindProject } from '../../data-access'
import { setupJobs } from '../../jobs'
import { database } from '../../client'
import { and, eq, inArray } from 'drizzle-orm'
import { spans as spansModel } from '../../schema'

export async function createDocumentLogsFromSpansJob({
  data: event,
}: {
  data: BulkCreateTracesAndSpansEvent
}) {
  const { projectId, spans } = event.data
  const spansLinkedToPrompts = spans.filter((span) => !!span.promptPath)
  if (!spansLinkedToPrompts.length) return

  const project = await unsafelyFindProject(projectId)
  if (!project) return

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
        span: s,
        commitUuid: span.commitUuid,
        promptPath: span.promptPath,
        distinctId: span.distinctId,
      })),
  )
  if (!spansToImport.length) return

  const jobs = await setupJobs()
  spansToImport.forEach(async (data) => {
    jobs.defaultQueue.jobs.enqueueCreateDocumentLogFromSpanJob({
      ...data,
      projectId: project.id,
    })
  })
}
