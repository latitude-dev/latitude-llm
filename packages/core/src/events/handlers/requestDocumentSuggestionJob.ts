import { LogSources } from '../../browser'
import { unsafelyFindWorkspace } from '../../data-access'
import { setupJobs } from '../../jobs'
import { generateDocumentSuggestionJobKey } from '../../jobs/job-definitions'
import { NotFoundError } from '../../lib'
import { EvaluationResultCreatedEvent } from '../events'

export const requestDocumentSuggestionJob = async ({
  data: event,
}: {
  data: EvaluationResultCreatedEvent
}) => {
  const {
    workspaceId,
    evaluationResult: { evaluationId },
    documentLog: { commitId, documentUuid, source },
  } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  if (source !== LogSources.Playground) return

  const queues = await setupJobs()
  queues.defaultQueue.jobs.enqueueGenerateDocumentSuggestionJob(
    {
      workspaceId: workspace.id,
      commitId: commitId,
      documentUuid: documentUuid,
      evaluationId: evaluationId,
    },
    {
      attempts: 1,
      deduplication: {
        id: generateDocumentSuggestionJobKey({
          workspaceId: workspace.id,
          commitId: commitId,
          documentUuid: documentUuid,
          evaluationId: evaluationId,
        }),
      },
    },
  )
}
