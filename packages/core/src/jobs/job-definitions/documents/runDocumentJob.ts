import { randomUUID } from 'crypto'

import { Job } from 'bullmq'

import { LogSources } from '@latitude-data/constants'
import { RunErrorCodes } from '@latitude-data/constants/errors'
import { ChainError } from '../../../lib/chainStreamManager/ChainErrors'
import { WebsocketClient, WorkerSocket } from '../../../websockets/workers'
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
  websockets: WorkerSocket,
  workspaceId: number,
  documentUuid: string,
  progressTracker: ProgressTracker,
) => {
  const progress = await progressTracker.getProgress()
  websockets.emit('documentBatchRunStatus', {
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

  const websockets = await WebsocketClient.getSocket()
  const progressTracker = new ProgressTracker(batchId)

  try {
    await runDocumentAtCommitWithAutoToolResponses({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      parameters,
      source: LogSources.Playground,
      autoRespondToolCalls,
    }).then((r) => r.unwrap())

    await progressTracker.incrementCompleted()

    await emitDocumentBatchRunStatus(
      websockets,
      workspaceId,
      documentUuid,
      progressTracker,
    )
  } catch (error) {
    if (
      error instanceof ChainError &&
      error.errorCode === RunErrorCodes.RateLimit
    ) {
      throw error // The job system will retry it with exponential backoff
    }

    await progressTracker.incrementErrors()
    await emitDocumentBatchRunStatus(
      websockets,
      workspaceId,
      documentUuid,
      progressTracker,
    )
  } finally {
    await progressTracker.cleanup()
  }
}
