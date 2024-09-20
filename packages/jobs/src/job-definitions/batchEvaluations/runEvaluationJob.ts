import { queues } from '@latitude-data/core/queues'
import {
  DocumentLogsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { runEvaluation } from '@latitude-data/core/services/evaluations/run'
import { WebsocketClient } from '@latitude-data/core/websockets/workers'
import { env } from '@latitude-data/env'
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
  const { workspaceId, batchId, documentUuid, documentLogUuid, evaluationId } =
    job.data
  const websockets = await WebsocketClient.getSocket()
  const progressTracker = new ProgressTracker(await queues(), batchId)

  try {
    const documentLogsScope = new DocumentLogsRepository(workspaceId)
    const evaluationsScope = new EvaluationsRepository(workspaceId)
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
    if (env.NODE_ENV !== 'production') {
      console.error(error)
    }

    await progressTracker.incrementErrors()
  } finally {
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
  }
}
