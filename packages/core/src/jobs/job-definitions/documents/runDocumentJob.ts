import { randomUUID } from 'crypto'

import { Job } from 'bullmq'

import { LogSources } from '@latitude-data/constants'
import { isErrorRetryable } from '../../../services/evaluationsV2/run'
import { BACKGROUND } from '../../../telemetry'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { runDocumentAtCommit } from '../../../services/commits'
import { getJobDocumentData } from '../helpers'

export type RunDocumentJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  projectId: number
  parameters?: Record<string, unknown>
  batchId?: string
  source?: LogSources
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
    source = LogSources.Playground,
  } = job.data

  const progressTracker = new ProgressTracker(batchId)

  const { workspace, document, commit } = await getJobDocumentData({
    workspaceId,
    projectId,
    commitUuid,
    documentUuid,
  }).then((r) => r.unwrap())

  try {
    await runDocumentAtCommit({
      context: BACKGROUND({ workspaceId }),
      workspace,
      commit,
      document,
      parameters,
      source,
      simulationSettings: {
        simulateToolResponses: true,
      },
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
