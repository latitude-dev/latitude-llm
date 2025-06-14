import { LogSources } from '../../browser'
import { unsafelyFindWorkspace } from '../../data-access'
import { generateDocumentSuggestionJobKey } from '../../jobs/job-definitions'
import { documentSuggestionsQueue } from '../../jobs/queues'
import { EvaluationResultV2CreatedEvent } from '../events'
import { NotFoundError } from './../../lib/errors'

const LIVE_SUGGESTION_SOURCES = [LogSources.Playground, LogSources.Experiment]

// TODO(evalsv2): add tests for evals v2
export const requestDocumentSuggestionJobV2 = async ({
  data: event,
}: {
  data: EvaluationResultV2CreatedEvent
}) => {
  const { workspaceId, result, evaluation, commit, providerLog } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  if (!LIVE_SUGGESTION_SOURCES.includes(providerLog.source)) return
  if (result.hasPassed || result.error || result.usedForSuggestion) return
  if (!evaluation.enableSuggestions) return

  documentSuggestionsQueue.add(
    'generateDocumentSuggestionJob',
    {
      workspaceId: workspace.id,
      commitId: commit.id,
      documentUuid: evaluation.documentUuid,
      evaluationUuid: evaluation.uuid,
    },
    {
      attempts: 1,
      deduplication: {
        id: generateDocumentSuggestionJobKey({
          workspaceId: workspace.id,
          commitId: commit.id,
          documentUuid: evaluation.documentUuid,
          evaluationUuid: evaluation.uuid,
        }),
      },
    },
  )
}
