import { Job } from 'bullmq'

import { LogSources } from '@latitude-data/constants'
import { isRetryableError } from '../../../lib/isRetryableError'
import { runDocumentAtCommit } from '../../../services/commits'
import { BACKGROUND } from '../../../telemetry'
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
    source = LogSources.Playground,
  } = job.data

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
  } catch (error) {
    if (isRetryableError(error as Error)) throw error
  }
}
