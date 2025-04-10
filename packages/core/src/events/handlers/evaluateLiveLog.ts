import { NON_LIVE_EVALUABLE_LOG_SOURCES } from '@latitude-data/constants'
import { LogSources } from '../../browser'
import {
  findLastProviderLogFromDocumentLogUuid,
  findWorkspaceFromDocumentLog,
} from '../../data-access'
import { runEvaluationV2JobKey } from '../../jobs/job-definitions'
import { CommitsRepository, EvaluationsV2Repository } from '../../repositories'
import { getEvaluationMetricSpecification } from '../../services/evaluationsV2'
import { DocumentLogCreatedEvent } from '../events'
import { evaluationsQueue } from '../../jobs/queues'
import { NotFoundError } from './../../lib/errors'

export const evaluateLiveLogJob = async ({
  data: event,
}: {
  data: DocumentLogCreatedEvent
}) => {
  const documentLog = event.data

  const workspace = await findWorkspaceFromDocumentLog(documentLog)
  if (!workspace)
    throw new NotFoundError(
      `Workspace not found from document log ${documentLog.id}`,
    )

  if (
    NON_LIVE_EVALUABLE_LOG_SOURCES.includes(
      documentLog.source ?? LogSources.API,
    )
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
  // Note: Failed document logs may not have provider logs
  if (!providerLog) return

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

  for (const evaluation of evaluations) {
    const payload = {
      workspaceId: workspace.id,
      commitId: commit.id,
      evaluationUuid: evaluation.uuid,
      providerLogUuid: providerLog.uuid,
    }

    evaluationsQueue.add('runEvaluationV2Job', payload, {
      deduplication: { id: runEvaluationV2JobKey(payload) },
    })
  }
}
