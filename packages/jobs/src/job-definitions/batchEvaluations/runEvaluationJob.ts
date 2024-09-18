import { queues } from '@latitude-data/core/queues'
import {
  DocumentLogsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { runEvaluation } from '@latitude-data/core/services/evaluations/run'
import { WebsocketClient } from '@latitude-data/core/websockets/workers'
import { Job } from 'bullmq'

import { ProgressTracker } from '../../utils/progressTracker'

type RunEvaluationJobData = {
  workspaceId: number
  documentUuid: string
  documentLogUuid: string
  evaluationId: number
  batchId: string
  skipProgress: boolean
}

export const runEvaluationJob = async (job: Job<RunEvaluationJobData>) => {
  const websockets = await WebsocketClient.getSocket()
  const {
    skipProgress,
    workspaceId,
    batchId,
    documentUuid,
    documentLogUuid,
    evaluationId,
  } = job.data

  const progressTracker = new ProgressTracker(queues(), batchId)
  const documentLogsScope = new DocumentLogsRepository(workspaceId)
  const evaluationsScope = new EvaluationsRepository(workspaceId)
  try {
    const documentLog = await documentLogsScope
      .findByUuid(documentLogUuid)
      .then((r) => r.unwrap())
    const evaluation = await evaluationsScope
      .find(evaluationId)
      .then((r) => r.unwrap())

    await runEvaluation({
      documentLog,
      evaluation,
    }).then((r) => r.unwrap())

    await progressTracker.incrementCompleted()
  } catch (error) {
    await progressTracker.incrementErrors()
  } finally {
    await progressTracker.decrementTotal()
    const progress = await progressTracker.getProgress()
    const finished = await progressTracker.isFinished()

    console.log('DEBUG: Emitting evaluationStatus before check')
    if (!skipProgress) {
      console.log('DEBUG: Emitting evaluationStatus', workspaceId)
      websockets.emit('evaluationStatus', {
        workspaceId,
        data: {
          batchId,
          evaluationId,
          documentUuid,
          status: finished ? 'finished' : 'running',
          ...progress,
          completed: progress.completed < 1 ? 1 : progress.completed,
        },
      })
    }
  }
}
