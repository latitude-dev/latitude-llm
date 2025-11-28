import { LogSources, PromptSpanMetadata } from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { generateDocumentSuggestionJobKey } from '../../jobs/job-definitions'
import { queues } from '../../jobs/queues'
import { NotFoundError } from '../../lib/errors'
import { SpanMetadatasRepository, SpansRepository } from '../../repositories'
import { EvaluationResultV2CreatedEvent } from '../events'

const LIVE_SUGGESTION_SOURCES = [LogSources.Playground, LogSources.Experiment]

// TODO(evalsv2): add tests for evals v2
export const requestDocumentSuggestionJobV2 = async ({
  data: event,
}: {
  data: EvaluationResultV2CreatedEvent
}) => {
  const { workspaceId, result, evaluation, commit, spanId, traceId } =
    event.data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  const spansRepo = new SpansRepository(workspaceId)
  const spansMetadataRepo = new SpanMetadatasRepository(workspaceId)
  const span = await spansRepo.get({ traceId, spanId }).then((r) => r.value)
  if (!span) return
  const metadata = await spansMetadataRepo
    .get({ spanId, traceId })
    .then((r) => r.value)
  if (!metadata) return

  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)
  if (result.hasPassed || result.error || result.usedForSuggestion) return
  if (!evaluation.enableSuggestions) return
  const promptMetadata = metadata as PromptSpanMetadata
  if (!promptMetadata.source || !LIVE_SUGGESTION_SOURCES.includes(promptMetadata.source)) return // prettier-ignore

  const { documentSuggestionsQueue } = await queues()
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
