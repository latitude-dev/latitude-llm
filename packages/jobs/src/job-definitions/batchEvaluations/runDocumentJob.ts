import { LogSources } from '@latitude-data/core/browser'
import { unsafelyFindWorkspace } from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { queues } from '@latitude-data/core/queues'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { setupJobs } from '../../'
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

export const runDocumentJob = async (job: Job<RunDocumentJobData>) => {
  const {
    workspaceId,
    documentUuid,
    commitUuid,
    projectId,
    parameters,
    evaluationId,
    batchId,
  } = job.data

  const jobs = await setupJobs()
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
    const result = await runDocumentAtCommit({
      workspace,
      document,
      commit,
      parameters,
      source: LogSources.Evaluation,
    }).then((r) => r.unwrap())

    await result.response

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
    await progressTracker.decrementTotal()
  }
}
