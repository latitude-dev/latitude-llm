import { Job } from 'bullmq'

import { LogSources } from '@latitude-data/constants'
import { NotFoundError } from '../../../lib/errors'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { runDocumentAtCommitWithAutoToolResponses } from '../documents/runDocumentAtCommitWithAutoToolResponses'
import { runEvaluationV2JobKey } from '../evaluations'
import { evaluationsQueue } from '../../queues'
import { isErrorRetryable } from '../../../services/evaluationsV2/run'

export type RunDocumentForEvaluationJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  commitId: number
  projectId: number
  parameters: Record<string, unknown>
  batchId: string
  autoRespondToolCalls: boolean
} & (
  | {
      evaluationId: number
      version: 'v1'
    }
  | {
      evaluationUuid: string
      datasetId: number
      datasetLabel?: string
      datasetRowId: number
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
    autoRespondToolCalls,
  } = job.data

  const progressTracker = new ProgressTracker(batchId)

  try {
    const result = await runDocumentAtCommitWithAutoToolResponses({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      parameters,
      source: LogSources.Evaluation,
      autoRespondToolCalls,
    }).then((r) => r.unwrap())

    const providerLog = (await result.lastResponse)?.providerLog
    if (!providerLog) {
      throw new NotFoundError('Provider log not found after running document')
    }

    if (version === 'v2') {
      const payload = {
        workspaceId,
        commitId,
        evaluationUuid: job.data.evaluationUuid,
        providerLogUuid: providerLog.uuid,
        datasetId: job.data.datasetId,
        datasetLabel: job.data.datasetLabel,
        datasetRowId: job.data.datasetRowId,
        batchId,
      }

      evaluationsQueue.add('runEvaluationV2Job', payload, {
        deduplication: { id: runEvaluationV2JobKey(payload) },
      })
    } else {
      await evaluationsQueue.add('runEvaluationJob', {
        workspaceId,
        documentUuid,
        providerLogUuid: providerLog.uuid,
        evaluationId: job.data.evaluationId,
        batchId,
      })
    }
  } catch (error) {
    if (isErrorRetryable(error as Error)) throw error

    await progressTracker.incrementErrors()

    const progress = await progressTracker.getProgress()
    const websockets = await WebsocketClient.getSocket()

    if (version === 'v2') {
      websockets.emit('evaluationStatus', {
        workspaceId,
        data: {
          batchId,
          commitId,
          documentUuid,
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
  } finally {
    await progressTracker.cleanup()
  }
}
