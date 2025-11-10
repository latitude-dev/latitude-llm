import { LogSources } from '../../constants'
import { findLastProviderLogFromDocumentLogUuid } from '../../data-access/providerLogs'
import { findWorkspaceFromDocumentLog } from '../../data-access/workspaces'
import { runEvaluationV2JobKey } from '../../jobs/job-definitions'
import { queues } from '../../jobs/queues'
import { NotFoundError } from '../../lib/errors'
import {
  CommitsRepository,
  DocumentLogsRepository,
  EvaluationsV2Repository,
} from '../../repositories'
import { getEvaluationMetricSpecification } from '../../services/evaluationsV2/specifications'
import { DocumentLogCreatedEvent, DocumentLogInteractedEvent } from '../events'
import { isFeatureEnabledByName } from '../../services/workspaceFeatures/isFeatureEnabledByName'
import { Result } from '../../lib/Result'

const LIVE_EVALUABLE_LOG_SOURCES = Object.values(LogSources).filter(
  (source) => source !== 'evaluation' && source !== 'experiment',
) as LogSources[]

export const evaluateLiveLogJob = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent | DocumentLogInteractedEvent
}) => {
  const { id, workspaceId } = event.data
  const repo = new DocumentLogsRepository(workspaceId)
  const documentLogResult = await repo.find(id)
  if (documentLogResult.error) return

  const documentLog = documentLogResult.unwrap()
  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  if (!workspace) {
    throw new NotFoundError(
      `Workspace not found from document log ${documentLog.id}`,
    )
  }

  if (
    !LIVE_EVALUABLE_LOG_SOURCES.includes(documentLog.source ?? LogSources.API)
  ) {
    return
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitById(documentLog.commitId)
    .then((r) => r.unwrap())
  const providerLog = await findLastProviderLogFromDocumentLogUuid(
    documentLog.uuid,
  )
  if (!providerLog) {
    throw new NotFoundError(`Provider log not found for document log ${id}`)
  }

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  let evaluations = await evaluationsRepository
    .listAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: documentLog.documentUuid,
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
      providerLogUuid: providerLog.uuid,
    }

    const { evaluationsQueue } = await queues()
    evaluationsQueue.add('runEvaluationV2Job', payload, {
      deduplication: { id: runEvaluationV2JobKey(payload) },
    })
  }
}
