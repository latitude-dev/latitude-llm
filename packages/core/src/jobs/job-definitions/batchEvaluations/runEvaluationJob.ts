import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { queues } from '../../../queues'
import {
  DocumentLogsRepository,
  EvaluationsRepository,
} from '../../../repositories'
import { runEvaluation } from '../../../services/evaluations/run'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'

export type RunEvaluationJobData = {
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

    const { response } = await runEvaluation({
      documentLog,
      evaluation,
      documentUuid,
    }).then((r) => r.unwrap())

    // Waiting for the reponse is important. It guarantees that the evaluation
    // has been created before we notify the client via websockets.
    await response

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
