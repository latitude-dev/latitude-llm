import {
  ChatSpanMetadata,
  DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
  DEFAULT_EVALUATION_SAMPLE_RATE,
  EvaluationV2,
  ExternalSpanMetadata,
  LIVE_EVALUABLE_SPAN_TYPES,
  LogSources,
  PromptSpanMetadata,
  TriggerConfiguration,
} from '../../constants'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import {
  runEvaluationV2JobKey,
  RunEvaluationV2JobData,
} from '../../jobs/job-definitions'
import { queues } from '../../jobs/queues'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import {
  CommitsRepository,
  EvaluationsV2Repository,
  SpanMetadatasRepository,
} from '../../repositories'
import { findSpan } from '../../queries/spans/findSpan'
import { isFirstMainSpanInConversation } from '../../queries/spans/findMainSpanByDocumentLogUuid'
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

function getTriggerConfig(evaluation: EvaluationV2): TriggerConfiguration {
  return (
    evaluation.configuration.trigger ?? {
      target: 'last',
      lastInteractionDebounce: DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS,
      sampleRate: DEFAULT_EVALUATION_SAMPLE_RATE,
    }
  )
}

function debouncedEvaluationJobKey(
  documentLogUuid: string,
  evaluationUuid: string,
): string {
  return `debouncedEvaluation-${documentLogUuid}-${evaluationUuid}`
}

export const evaluateLiveLogJob = async ({
  data: event,
}: {
  data: SpanCreatedEvent
}) => {
  const { spanId, traceId, workspaceId } = event.data
  const metadataRepo = new SpanMetadatasRepository(workspaceId)
  const span = await findSpan({ workspaceId, spanId, traceId })
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

  if (!span.commitUuid || !span.documentUuid || !span.documentLogUuid) {
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

  const evaluationsDisabledResult = await isFeatureEnabledByName(
    workspace.id,
    'evaluationsDisabled',
  )
  if (!Result.isOk(evaluationsDisabledResult)) return evaluationsDisabledResult

  const evaluationsDisabled = evaluationsDisabledResult.unwrap()
  if (evaluationsDisabled) {
    return
  }

  const { evaluationsQueue } = await queues()

  for (const evaluation of evaluations) {
    const triggerConfig = getTriggerConfig(evaluation)

    if (triggerConfig.target === 'first') {
      const isFirst = await isFirstMainSpanInConversation({
        workspaceId,
        documentLogUuid: span.documentLogUuid,
        spanId: span.id,
        traceId: span.traceId,
      })
      if (!isFirst) continue
    }

    const sampleRate =
      triggerConfig.sampleRate ?? DEFAULT_EVALUATION_SAMPLE_RATE

    if (Math.random() * 100 > sampleRate) {
      // Skip evaluation
      continue
    }

    const payload: RunEvaluationV2JobData = {
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluation.uuid,
      traceId: span.traceId,
      spanId: span.id,
    }

    if (triggerConfig.target === 'last') {
      const debounceJobId = debouncedEvaluationJobKey(
        span.documentLogUuid,
        evaluation.uuid,
      )
      const debounceMs =
        (triggerConfig.lastInteractionDebounce ??
          DEFAULT_LAST_INTERACTION_DEBOUNCE_SECONDS) * 1000

      const existingJob = await evaluationsQueue.getJob(debounceJobId)
      if (existingJob) {
        await existingJob.remove()
      }

      await evaluationsQueue.add('runEvaluationV2Job', payload, {
        jobId: debounceJobId,
        delay: debounceMs,
        deduplication: { id: runEvaluationV2JobKey(payload) },
      })
    } else {
      await evaluationsQueue.add('runEvaluationV2Job', payload, {
        deduplication: { id: runEvaluationV2JobKey(payload) },
      })
    }
  }
}
