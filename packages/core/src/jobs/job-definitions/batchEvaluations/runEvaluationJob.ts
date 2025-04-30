import { Job } from 'bullmq'
import {
  EvaluationsRepository,
  ProviderLogsRepository,
} from '../../../repositories'
import { runEvaluation } from '../../../services/evaluations/run'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { getUnknownError } from './../../../lib/getUnknownError'
import { Result } from './../../../lib/Result'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'

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
  let progressTracker: ProgressTracker | undefined
  if (batchId) {
    progressTracker = new ProgressTracker(batchId)
  }

  try {
    const websockets = await WebsocketClient.getSocket()
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

    if (
      run.error &&
      run.error instanceof ChainError &&
      run.error.errorCode === RunErrorCodes.RateLimit
    ) {
      throw run.error // The job system will retry it with exponential backoff
    }

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
  } finally {
    progressTracker?.cleanup()
  }
}
