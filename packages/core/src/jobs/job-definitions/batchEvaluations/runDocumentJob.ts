import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { LogSources } from '@latitude-data/constants'
import { setupQueues } from '../../'
import { NotFoundError } from '../../../lib/errors'
import { queuesConnection } from '../../../queues'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { runDocumentAtCommitWithAutoToolResponses } from '../documents/runDocumentAtCommitWithAutoToolResponses'
import { runEvaluationV2JobKey } from '../evaluations'

export type RunDocumentForEvaluationJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  commitId: number
  projectId: number
  parameters: Record<string, unknown>
  batchId: string
} & (
  | {
      evaluationId: number
      version: 'v1'
    }
  | {
      evaluationUuid: string
      datasetId: number
      rowId: number
      version: 'v2'
    }
)

export const runDocumentForEvaluationJob = async (
  job: Job<RunDocumentForEvaluationJobData>,
) => {
  const {
    workspaceId,
    documentUuid,
    commitUuid,
    commitId,
    projectId,
    parameters,
    version,
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

    if (version === 'v2') {
      const payload = {
        workspaceId: workspaceId,
        commitId: commitId,
        evaluationUuid: job.data.evaluationUuid,
        providerLogUuid: providerLog.uuid,
        datasetId: job.data.datasetId,
        rowId: job.data.rowId,
        batchId: batchId,
      }

      queues.evaluationsQueue.jobs.enqueueRunEvaluationV2Job(payload, {
        deduplication: { id: runEvaluationV2JobKey(payload) },
      })
    } else {
      await queues.evaluationsQueue.jobs.enqueueRunEvaluationJob({
        workspaceId,
        documentUuid,
        providerLogUuid: providerLog.uuid,
        evaluationId: job.data.evaluationId,
        batchId,
      })
    }
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      console.error(error)
    }

    await progressTracker.incrementErrors()

    const progress = await progressTracker.getProgress()
    const websockets = await WebsocketClient.getSocket()

    if (version === 'v2') {
      websockets.emit('evaluationStatus', {
        workspaceId,
        data: {
          batchId,
          commitId: commitId,
          documentUuid: documentUuid,
          evaluationUuid: job.data.evaluationUuid,
          version: 'v2',
          ...progress,
        },
      })
    } else {
      websockets.emit('evaluationStatus', {
        workspaceId,
        data: {
          batchId,
          evaluationId: job.data.evaluationId,
          documentUuid,
          version: 'v1',
          ...progress,
        },
      })
    }
  }
}
