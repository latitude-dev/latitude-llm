import { randomUUID } from 'crypto'

import { Job } from 'bullmq'

import { LogSources } from '@latitude-data/constants'
import { isErrorRetryable } from '../../../services/evaluationsV2/run'
import { BACKGROUND } from '../../../telemetry'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { runDocumentAtCommitWithAutoToolResponses } from './runDocumentAtCommitWithAutoToolResponses'

export type RunDocumentJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  projectId: number
  autoRespondToolCalls: boolean
  parameters?: Record<string, unknown>
  batchId?: string
}

const emitDocumentBatchRunStatus = async (
  workspaceId: number,
  documentUuid: string,
  progressTracker: ProgressTracker,
) => {
  const progress = await progressTracker.getProgress()
  WebsocketClient.sendEvent('documentBatchRunStatus', {
    workspaceId,
    data: {
      documentUuid,
      ...progress,
    },
  })
}

/**
 * WARNING: This is for internal use inside Latitude app. Do not
 * use for users' requests from the API gateway.
 *
 * It calls AI to full fill documents with tool calls. This is not what
 * we want for users' requests from the API gateway.
 */
export const runDocumentJob = async (job: Job<RunDocumentJobData>) => {
  const {
    workspaceId,
    documentUuid,
    commitUuid,
    projectId,
    parameters = {},
    batchId = randomUUID(),
    autoRespondToolCalls,
  } = job.data

  const progressTracker = new ProgressTracker(batchId)

  try {
    await runDocumentAtCommitWithAutoToolResponses({
      context: BACKGROUND({ workspaceId }),
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      parameters,
      source: LogSources.Playground,
      autoRespondToolCalls,
    }).then((r) => r.unwrap())

    await progressTracker.incrementCompleted()

    await emitDocumentBatchRunStatus(workspaceId, documentUuid, progressTracker)
  } catch (error) {
    if (isErrorRetryable(error as Error)) throw error

    await progressTracker.incrementErrors()
    await emitDocumentBatchRunStatus(workspaceId, documentUuid, progressTracker)
  } finally {
    await progressTracker.cleanup()
  }
}
