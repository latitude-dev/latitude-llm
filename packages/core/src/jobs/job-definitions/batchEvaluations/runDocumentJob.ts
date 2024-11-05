import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { setupJobs } from '../../'
import { LogSources } from '../../../browser'
import { unsafelyFindWorkspace } from '../../../data-access'
import { NotFoundError } from '../../../lib/errors'
import { queues } from '../../../queues'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '../../../repositories'
import { runDocumentAtCommit } from '../../../services/commits/runDocumentAtCommit'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'

export type RunDocumentForEvaluationJobData = {
  workspaceId: number
  documentUuid: string
  commitUuid: string
  projectId: number
  parameters: Record<string, unknown>
  evaluationId: number
  batchId: string
}

export const runDocumentForEvaluationJob = async (
  job: Job<RunDocumentForEvaluationJobData>,
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

    const response = await result.response
    const responseValue = response.unwrap()
    const providerLogUuid = responseValue?.providerLog?.uuid
    if (!providerLogUuid) {
      throw new NotFoundError('Provider log not found after running document')
    }

    await jobs.defaultQueue.jobs.enqueueRunEvaluationJob(
      {
        workspaceId,
        documentUuid: document.documentUuid,
        providerLogUuid,
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
