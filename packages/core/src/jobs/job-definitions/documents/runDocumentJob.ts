import { randomUUID } from 'crypto'

import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { queuesConnection } from '../../../queues'
import { WebsocketClient, WorkerSocket } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { runDocumentAtCommitWithAutoToolResponses } from './runDocumentAtCommitWithAutoToolResponses'
import { LogSources } from '@latitude-data/constants'

export type RunDocumentJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  projectId: number
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
  } = job.data
  const websockets = await WebsocketClient.getSocket()
  const progressTracker = new ProgressTracker(await queuesConnection(), batchId)

  try {
    await runDocumentAtCommitWithAutoToolResponses({
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      parameters,
      source: LogSources.Playground,
    }).then((r) => r.unwrap())

    await progressTracker.incrementCompleted()

    await emitDocumentBatchRunStatus(
      websockets,
      workspaceId,
      documentUuid,
      progressTracker,
    )
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      console.error(error)
    }

    await progressTracker.incrementErrors()
    await emitDocumentBatchRunStatus(
      websockets,
      workspaceId,
      documentUuid,
      progressTracker,
    )
  }
}
