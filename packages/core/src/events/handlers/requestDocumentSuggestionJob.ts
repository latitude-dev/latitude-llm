import { LogSources } from '../../browser'
import { unsafelyFindWorkspace } from '../../data-access'
import { setupJobs } from '../../jobs'
import { NotFoundError } from '../../lib'
import { EvaluationResultsRepository } from '../../repositories'
import { EvaluationResultCreatedEvent } from '../events'

export const requestDocumentSuggestionJob = async ({
  data: event,
}: {
  data: EvaluationResultCreatedEvent
}) => {
  const {
    workspaceId,
    evaluationResult: { id: resultId },
    documentLog: { commitId, documentUuid },
  } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const resultsRepository = new EvaluationResultsRepository(workspace.id)
  const result = await resultsRepository.find(resultId).then((r) => r.unwrap())
  if (result.source !== LogSources.Playground) return

  const queues = await setupJobs()
  queues.defaultQueue.jobs.enqueueGenerateDocumentSuggestionJob(
    {
      workspaceId: workspace.id,
      commitId: commitId,
      documentUuid: documentUuid,
      evaluationId: result.evaluationId,
    },
    { attempts: 1 },
  )
}
