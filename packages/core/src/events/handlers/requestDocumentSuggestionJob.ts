import { LogSources } from '../../browser'
import { unsafelyFindWorkspace } from '../../data-access'
import { generateDocumentSuggestionJobKey } from '../../jobs/job-definitions'
import { documentsQueue } from '../../jobs/queues'
import { NotFoundError } from '../../lib'
import { hasEvaluationResultPassed } from '../../services/evaluationResults'
import {
  EvaluationResultCreatedEvent,
  EvaluationResultV2CreatedEvent,
} from '../events'

const LIVE_SUGGESTION_SOURCES = [LogSources.Playground, LogSources.Evaluation]

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

  if (!LIVE_SUGGESTION_SOURCES.includes(documentLog.source ?? LogSources.API)) {
    return
  }

  if (hasEvaluationResultPassed({ result, evaluation })) return

  documentsQueue.add(
    'generateDocumentSuggestionJob',
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

  documentsQueue.add(
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
