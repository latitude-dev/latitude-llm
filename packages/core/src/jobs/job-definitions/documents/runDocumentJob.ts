import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { LogSources } from '../../../browser'
import { unsafelyFindWorkspace } from '../../../data-access'
import { NotFoundError } from '../../../lib/errors'
import { queues } from '../../../queues'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { WebsocketClient, WorkerSocket } from '../../../websockets/workers'
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
