import { LogSources } from '@latitude-data/core/browser'
import {
  CommitsRepository,
  DocumentVersionsRepository,
} from '@latitude-data/core/repositories'
import { runDocumentAtCommit } from '@latitude-data/core/services/commits/runDocumentAtCommit'
import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { setupJobs } from '../../'
import { connection } from '../../utils/connection'
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

  const progressTracker = new ProgressTracker(connection, batchId)

  try {
    const documentsScope = new DocumentVersionsRepository(workspaceId)
    const commitsScope = new CommitsRepository(workspaceId)
    const document = await documentsScope
      .getDocumentAtCommit({ projectId, documentUuid, commitUuid })
      .then((r) => r.unwrap())
    const commit = await commitsScope
      .getCommitByUuid({ projectId, uuid: commitUuid })
      .then((r) => r.unwrap())
    const result = await runDocumentAtCommit({
      workspaceId,
      document,
      commit,
      parameters,
      source: LogSources.Evaluation,
    }).then((r) => r.unwrap())

    await result.response

    const queues = setupJobs()

    // Enqueue the evaluation job
    await queues.defaultQueue.jobs.enqueueRunEvaluationJob({
      workspaceId,
      documentLogUuid: result.documentLogUuid,
      evaluationId,
      batchId,
    })
  } catch (error) {
    if (env.NODE_ENV !== 'production') {
      console.error(error)
    }

    await progressTracker.incrementErrors()
    await progressTracker.decrementTotal()
  }
}
