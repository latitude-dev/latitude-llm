import {
  DocumentLogsRepository,
  EvaluationsRepository,
} from '@latitude-data/core/repositories'
import { runEvaluation } from '@latitude-data/core/services/evaluations/run'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { connection } from '../../utils/connection'
import { ProgressTracker } from '../../utils/progressTracker'

type RunEvaluationJobData = {
  workspaceId: number
  documentLogUuid: string
  evaluationId: number
  batchId: string
}

export const runEvaluationJob = async (job: Job<RunEvaluationJobData>) => {
  const { workspaceId, batchId, documentLogUuid, evaluationId } = job.data

  const progressTracker = new ProgressTracker(connection, batchId)
  const documentLogsScope = new DocumentLogsRepository(workspaceId)
  const evaluationsScope = new EvaluationsRepository(workspaceId)

  try {
    const documentLog = await documentLogsScope
      .findByUuid(documentLogUuid)
      .then((r) => r.unwrap())
    const evaluation = await evaluationsScope
      .find(evaluationId)
      .then((r) => r.unwrap())

    const { response } = await runEvaluation({
      documentLog,
      evaluation,
    }).then((r) => r.unwrap())

    await response

    await progressTracker.incrementCompleted()
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      console.error('Error in runEvaluationJob:', error)
    }

    await progressTracker.incrementErrors()
    await progressTracker.decrementTotal()
  }
}
