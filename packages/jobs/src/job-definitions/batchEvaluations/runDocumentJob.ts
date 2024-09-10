import {
  Commit,
  DocumentVersion,
  LogSources,
} from '@latitude-data/core/browser'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { setupJobs } from '../../'
import { Queues } from '../../constants'
import { connection } from '../../utils/connection'
import { ProgressTracker } from '../../utils/progressTracker'

type RunDocumentJobData = {
  workspaceId: number
  document: DocumentVersion
  commit: Commit
  parameters: Record<string, unknown>
  evaluationId: number
  batchId: string
}

export const runDocumentJob = {
  name: 'runDocumentJob',
  queue: Queues.defaultQueue,
  handler: async (job: Job<RunDocumentJobData>) => {
    const { workspaceId, document, commit, parameters, evaluationId, batchId } =
      job.data

    const progressTracker = new ProgressTracker(connection, batchId)

    try {
      const result = await runDocumentAtCommit({
        workspaceId,
        document,
        commit,
        parameters,
        source: LogSources.Evaluation,
      }).then((r) => r.unwrap())

      await result.response

      const queues = setupJobs()

      // Enqueue the evaluation job
      await queues.defaultQueue.jobs.enqueueRunEvaluationJob({
        documentLogUuid: result.documentLogUuid,
        evaluationId,
        batchId,
      })
    } catch (error) {
      if (env.NODE_ENV !== 'production') {
        console.error(error)
      }

      await progressTracker.incrementErrors()
      await progressTracker.decrementTotal()
    }
  },
}
