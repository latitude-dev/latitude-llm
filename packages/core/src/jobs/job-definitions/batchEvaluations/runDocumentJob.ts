import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { setupQueues } from '../../'
import { NotFoundError } from '../../../lib/errors'
import { queuesConnection } from '../../../queues'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { runDocumentAtCommitWithAutoToolResponses } from '../documents/runDocumentAtCommitWithAutoToolResponses'
import { LogSources } from '@latitude-data/constants'

export type RunDocumentForEvaluationJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  projectId: number
  parameters: Record<string, unknown>
  evaluationId: number
  batchId: string
}

export const runDocumentForEvaluationJob = async (
  job: Job<RunDocumentForEvaluationJobData>,
) => {
  const {
    workspaceId,
    documentUuid,
    commitUuid,
    projectId,
    parameters,
    evaluationId,
    batchId,
  } = job.data
  const progressTracker = new ProgressTracker(await queuesConnection(), batchId)

  try {
    const queues = await setupQueues()
    const result = await runDocumentAtCommitWithAutoToolResponses({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      parameters,
      source: LogSources.Evaluation,
    }).then((r) => r.unwrap())

    const providerLog = (await result.lastResponse)?.providerLog

    if (!providerLog) {
      throw new NotFoundError('Provider log not found after running document')
    }

    await queues.defaultQueue.jobs.enqueueRunEvaluationJob(
      {
        workspaceId,
        documentUuid,
        providerLogUuid: providerLog.uuid,
        evaluationId,
        batchId,
      },
      { lifo: true },
    )
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      console.error(error)
    }

    await progressTracker.incrementErrors()

    const progress = await progressTracker.getProgress()
    const websockets = await WebsocketClient.getSocket()

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
