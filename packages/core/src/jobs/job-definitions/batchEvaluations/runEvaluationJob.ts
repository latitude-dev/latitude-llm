import { Job } from 'bullmq'

import { getUnknownError, Result } from '../../../lib'
import { queuesConnection } from '../../../queues'
import {
  EvaluationsRepository,
  ProviderLogsRepository,
} from '../../../repositories'
import { runEvaluation } from '../../../services/evaluations/run'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'

async function fetchData({
  workspaceId,
  evaluationId,
  providerLogUuid,
}: {
  workspaceId: number
  evaluationId: number
  providerLogUuid: string
}) {
  const providerLogsRepository = new ProviderLogsRepository(workspaceId)
  const evaluationsRepository = new EvaluationsRepository(workspaceId)
  const providerLogResult =
    await providerLogsRepository.findByUuid(providerLogUuid)
  if (providerLogResult.error) return providerLogResult

  const result = await evaluationsRepository.find(evaluationId)
  if (result.error) return result

  return Result.ok({
    providerLog: providerLogResult.value,
    evaluation: result.value,
  })
}

export type RunEvaluationJobData = {
  workspaceId: number
  documentUuid: string
  providerLogUuid: string
  evaluationId: number
  batchId?: string
}

async function isSuccessful(run: Awaited<ReturnType<typeof runEvaluation>>) {
  if (run.error) return { ok: false, error: run.error }

  const response = run.unwrap()
  const responseError = await response.error
  if (responseError) return { ok: false, error: responseError }

  return { ok: true, error: undefined }
}

export async function runEvaluationJob(job: Job<RunEvaluationJobData>) {
  const { workspaceId, batchId, documentUuid, providerLogUuid, evaluationId } =
    job.data
  const websockets = await WebsocketClient.getSocket()
  let progressTracker: ProgressTracker | undefined
  if (batchId) {
    progressTracker = new ProgressTracker(await queuesConnection(), batchId)
  }
  const { providerLog, evaluation } = await fetchData({
    workspaceId,
    evaluationId,
    providerLogUuid,
  }).then((r) => r.unwrap())

  const run = await runEvaluation({
    providerLog,
    evaluation,
    documentUuid,
  })

  const { ok, error } = await isSuccessful(run)

  if (ok) {
    await progressTracker?.incrementCompleted()
  } else {
    await progressTracker?.incrementErrors()
  }

  const progress = await progressTracker?.getProgress()

  if (batchId && progress) {
    websockets.emit('evaluationStatus', {
      workspaceId,
      data: {
        batchId,
        evaluationId,
        documentUuid,
        version: 'v1',
        ...progress,
      },
    })
  }

  const unknownError = getUnknownError(error)

  if (unknownError) throw unknownError
}
