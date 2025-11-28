import { LogSources, PromptSpanMetadata, SpanType } from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { runEvaluationV2JobKey } from '../../jobs/job-definitions'
import { queues } from '../../jobs/queues'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
  SpansRepository,
} from '../../repositories'
import { getEvaluationMetricSpecification } from '../../services/evaluationsV2/specifications'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { SpanCreatedEvent } from '../events'

const LIVE_EVALUABLE_LOG_SOURCES = Object.values(LogSources).filter(
  (source) => source !== 'evaluation' && source !== 'experiment',
) as LogSources[]

export const evaluateLiveLogJob = async ({
  data: event,
}: {
  data: SpanCreatedEvent
}) => {
  const { spanId, traceId, workspaceId } = event.data
  const repo = new SpansRepository(workspaceId)
  const metadataRepo = new SpanMetadatasRepository(workspaceId)
  const span = await repo.get({ spanId, traceId }).then((r) => r.value)
  if (!span) return
  if (span.type !== SpanType.Prompt) return

  const promptSpanMetadata = (await metadataRepo
    .get({ spanId, traceId })
    .then((r) => r.value)) as PromptSpanMetadata | undefined
  if (!promptSpanMetadata) return

  const workspace = await unsafelyFindWorkspace(span.workspaceId)
  if (!workspace) {
    throw new NotFoundError(
      `Workspace not found from spanId ${span.id} and traceId ${span.traceId}`,
    )
  }

  if (
    !LIVE_EVALUABLE_LOG_SOURCES.includes(
      promptSpanMetadata.source ?? LogSources.API,
    )
  ) {
    return
  }

  // Cannot evaluate logs without a document UUID
  if (!promptSpanMetadata.promptUuid) {
    return
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitByUuid({ uuid: promptSpanMetadata.versionUuid })
    .then((r) => r.unwrap())

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  let evaluations = await evaluationsRepository
    .listAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: promptSpanMetadata.promptUuid,
    })
    .then((r) => r.unwrap())

  evaluations = evaluations.filter(
    (evaluation) =>
      evaluation.evaluateLiveLogs &&
      getEvaluationMetricSpecification(evaluation).supportsLiveEvaluation,
  )

  // TODO(): This is temporary while we think of a more long lasting solution to ban/rate limit users
  const evaluationsDisabledResult = await isFeatureEnabledByName(
    workspace.id,
    'evaluationsDisabled',
  )
  if (!Result.isOk(evaluationsDisabledResult)) return evaluationsDisabledResult

  const evaluationsDisabled = evaluationsDisabledResult.unwrap()
  if (evaluationsDisabled) {
    // Evaluations are disabled for this workspace, skip enqueueing
    return
  }

  for (const evaluation of evaluations) {
    const payload = {
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluation.uuid,
      traceId: span.traceId,
      spanId: span.id,
    }

    const { evaluationsQueue } = await queues()
    evaluationsQueue.add('runEvaluationV2Job', payload, {
      deduplication: { id: runEvaluationV2JobKey(payload) },
    })
  }
}
