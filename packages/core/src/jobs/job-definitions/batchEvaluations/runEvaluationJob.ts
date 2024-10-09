import { Job } from 'bullmq'

import { RunErrorCodes } from '../../../constants'
import { Result } from '../../../lib'
import { queues } from '../../../queues'
import {
  DocumentLogsRepository,
  EvaluationsRepository,
} from '../../../repositories'
import { isChainError } from '../../../services/chains/ChainStreamConsumer'
import { runEvaluation } from '../../../services/evaluations/run'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'

function throwIfUnknownError(
  error: unknown | undefined,
): asserts error is Error {
  const isAllGood =
    !error || (isChainError(error) && error.errorCode !== RunErrorCodes.Unknown)

  if (isAllGood) return

  throw error
}

async function fetchData({
  workspaceId,
  evaluationId,
  documentLogUuid,
}: {
  workspaceId: number
  evaluationId: number
  documentLogUuid: string
}) {
  const documentLogsScope = new DocumentLogsRepository(workspaceId)
  const evaluationsScope = new EvaluationsRepository(workspaceId)
  const docLogResult = await documentLogsScope.findByUuid(documentLogUuid)

  if (docLogResult.error) return docLogResult

  const result = await evaluationsScope.find(evaluationId)
  if (result.error) return result

  return Result.ok({
    documentLog: docLogResult.value,
    evaluation: result.value,
  })
}
export type RunEvaluationJobData = {
  workspaceId: number
  documentUuid: string
  documentLogUuid: string
  evaluationId: number
  batchId: string
  skipProgress: boolean
}

export async function runEvaluationJob(job: Job<RunEvaluationJobData>) {
  const { workspaceId, batchId, documentUuid, documentLogUuid, evaluationId } =
    job.data
  const websockets = await WebsocketClient.getSocket()
  const progressTracker = new ProgressTracker(await queues(), batchId)
  const { documentLog, evaluation } = await fetchData({
    workspaceId,
    evaluationId,
    documentLogUuid,
  }).then((r) => r.unwrap())

  const result = await runEvaluation({
    documentLog,
    evaluation,
    documentUuid,
  })

  if (result.ok) {
    await progressTracker.incrementCompleted()
  } else {
    await progressTracker.incrementErrors()
  }

  const progress = await progressTracker.getProgress()
  websockets.emit('evaluationStatus', {
    workspaceId,
    data: {
      batchId,
      evaluationId,
      documentUuid,
      ...progress,
    },
  })

  throwIfUnknownError(result.error)
}
