import { LogSources } from '../../browser'
import { unsafelyFindWorkspace } from '../../data-access'
import { setupQueues } from '../../jobs'
import { generateDocumentSuggestionJobKey } from '../../jobs/job-definitions'
import { NotFoundError } from '../../lib'
import { hasEvaluationResultPassed } from '../../services/evaluationResults'
import { EvaluationResultCreatedEvent } from '../events'

export const requestDocumentSuggestionJob = async ({
  data: event,
}: {
  data: EvaluationResultCreatedEvent
}) => {
  const {
    workspaceId,
    evaluationResult: result,
    evaluation,
    documentLog,
  } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  if (documentLog.source !== LogSources.Playground) return
  if (hasEvaluationResultPassed({ result, evaluation })) return

  const queues = await setupQueues()
  queues.defaultQueue.jobs.enqueueGenerateDocumentSuggestionJob(
    {
      workspaceId: workspace.id,
      commitId: documentLog.commitId,
      documentUuid: documentLog.documentUuid,
      evaluationId: evaluation.id,
    },
    {
      attempts: 1,
      deduplication: {
        id: generateDocumentSuggestionJobKey({
          workspaceId: workspace.id,
          commitId: documentLog.commitId,
          documentUuid: documentLog.documentUuid,
          evaluationId: evaluation.id,
        }),
      },
    },
  )
}
