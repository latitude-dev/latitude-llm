import { LogSources } from '@latitude-data/core/browser'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { queues } from '@latitude-data/core/queues'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import {
  WebsocketClient,
  WorkerSocket,
} from '@latitude-data/core/websockets/workers'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { ProgressTracker } from '../../utils/progressTracker'

type RunDocumentJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  projectId: number
  parameters: Record<string, unknown>
  batchId: string
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

export const runDocumentJob = async (job: Job<RunDocumentJobData>) => {
  const {
    workspaceId,
    documentUuid,
    commitUuid,
    projectId,
    parameters,
    batchId,
  } = job.data
  const websockets = await WebsocketClient.getSocket()
  const progressTracker = new ProgressTracker(await queues(), batchId)

  try {
    const workspace = await unsafelyFindWorkspace(workspaceId)
    if (!workspace) throw new NotFoundError('Workspace not found')

    const documentsScope = new DocumentVersionsRepository(workspaceId)
    const commitsScope = new CommitsRepository(workspaceId)
    const document = await documentsScope
      .getDocumentAtCommit({ projectId, documentUuid, commitUuid })
      .then((r) => r.unwrap())
    const commit = await commitsScope
      .getCommitByUuid({ projectId, uuid: commitUuid })
      .then((r) => r.unwrap())
    await runDocumentAtCommit({
      workspace,
      document,
      commit,
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
