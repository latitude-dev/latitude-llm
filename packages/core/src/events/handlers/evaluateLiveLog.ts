import {
  ChatSpanMetadata,
  ExternalSpanMetadata,
  LIVE_EVALUABLE_SPAN_TYPES,
  LogSources,
  PromptSpanMetadata,
} from '../../constants'
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
import { captureException } from '../../utils/datadogCapture'
import { SpanCreatedEvent } from '../events'

const LIVE_EVALUABLE_LOG_SOURCES = Object.values(LogSources).filter(
  (source) =>
    source !== LogSources.Evaluation &&
    source !== LogSources.Experiment &&
    source !== LogSources.Optimization,
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
  if (!LIVE_EVALUABLE_SPAN_TYPES.includes(span.type)) return

  const spanMetadata = (await metadataRepo
    .get({ spanId, traceId })
    .then((r) => r.value)) as
    | PromptSpanMetadata
    | ExternalSpanMetadata
    | ChatSpanMetadata
    | undefined
  if (!spanMetadata) return

  const workspace = await unsafelyFindWorkspace(span.workspaceId)
  if (!workspace) {
    throw new NotFoundError(
      `Workspace not found from spanId ${span.id} and traceId ${span.traceId}`,
    )
  }

  if (!span.source) {
    captureException(
      new Error(
        `[evaluateLiveLogJob] Span has no source. spanId=${span.id}, traceId=${span.traceId}, type=${span.type}`,
      ),
    )
    return
  }

  if (!LIVE_EVALUABLE_LOG_SOURCES.includes(span.source)) {
    return
  }

  if (!span.commitUuid || !span.documentUuid) {
    return
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitByUuid({ uuid: span.commitUuid })
    .then((r) => r.unwrap())

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  let evaluations = await evaluationsRepository
    .listAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: span.documentUuid,
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
