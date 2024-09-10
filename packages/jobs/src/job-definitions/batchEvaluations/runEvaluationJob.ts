import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { Queues } from '../../constants'
import { connection } from '../../utils/connection'
import { ProgressTracker } from '../../utils/progressTracker'

type RunEvaluationJobData = {
  documentLogUuid: string
  evaluationId: number
  batchId: string
}

export const runEvaluationJob = {
  name: 'runEvaluationJob',
  queue: Queues.defaultQueue,
  handler: async (job: Job<RunEvaluationJobData>) => {
    const { batchId } = job.data

    const progressTracker = new ProgressTracker(connection, batchId)

    try {
      // Mock implementation of evaluation logic
      const mockEvaluationLogic = async () => {
        // Simulate some processing time
        await new Promise((resolve) => setTimeout(resolve, 2000))

        // Randomly throw an error 5% of the time
        if (Math.random() < 0.05) {
          throw new Error('Random evaluation error')
        }
      }

      await mockEvaluationLogic()
      await progressTracker.incrementCompleted()
    } catch (error) {
      if (env.NODE_ENV !== 'production') {
        console.error('Error in runEvaluationJob:', error)
      }

      await progressTracker.incrementErrors()
      await progressTracker.decrementTotal()
    }
  },
}
