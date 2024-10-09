import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { setupJobs } from '../../'
import { LogSources } from '../../../browser'
import { unsafelyFindWorkspace } from '../../../data-access'
import { BadRequestError, NotFoundError } from '../../../lib/errors'
import { queues } from '../../../queues'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'

type RunDocumentJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  projectId: number
  parameters: Record<string, unknown>
  evaluationId: number
  batchId: string
}

export const runDocumentForEvaluationJob = async (
  job: Job<RunDocumentJobData>,
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
  const progressTracker = new ProgressTracker(await queues(), batchId)

  try {
    const jobs = await setupJobs()
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
    const result = await runDocumentAtCommit({
      workspace,
      document,
      commit,
      parameters,
      source: LogSources.Evaluation,
    }).then((r) => r.unwrap())

    // TODO handle this error better
    const res = await result.response
    if (!res) throw new BadRequestError('Document run failed')

    await jobs.defaultQueue.jobs.enqueueRunEvaluationJob(
      {
        workspaceId,
        documentUuid: document.documentUuid,
        documentLogUuid: result.documentLogUuid,
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
