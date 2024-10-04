import { randomUUID } from 'crypto'

import {
  Dataset,
  DocumentVersion,
  EvaluationDto,
  User,
  Workspace,
} from '@latitude-data/core/browser'
import { publisher } from '@latitude-data/core/events/publisher'
import { queues } from '@latitude-data/core/queues'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { previewDataset } from '@latitude-data/core/services/datasets/preview'
import { WebsocketClient } from '@latitude-data/core/websockets/workers'
import { Job } from 'bullmq'

import { setupJobs } from '../..'
import { ProgressTracker } from '../../utils/progressTracker'

type RunBatchEvaluationJobParams = {
  workspace: Workspace
  user: User
  evaluation: EvaluationDto
  dataset: Dataset
  document: DocumentVersion
  commitUuid: string
  projectId: number
  fromLine?: number
  toLine?: number
  parametersMap?: Record<string, number>
  batchId?: string
}

export const runBatchEvaluationJob = async (
  job: Job<RunBatchEvaluationJobParams>,
) => {
  const {
    workspace,
    user,
    evaluation,
    dataset,
    document,
    projectId,
    commitUuid,
    fromLine,
    toLine,
    parametersMap,
    batchId = randomUUID(),
  } = job.data
  const websockets = await WebsocketClient.getSocket()
  const commit = await new CommitsRepository(workspace.id)
    .getCommitByUuid({ projectId, uuid: commitUuid })
    .then((r) => r.unwrap())
  const fileMetadata = dataset.fileMetadata

  publisher.publishLater({
    type: 'batchEvaluationRun',
    data: {
      evaluationId: evaluation.id,
      workspaceId: workspace.id,
      userEmail: user.email,
    },
  })

  // TODO: use streaming instead of this service in order to avoid loading the
  // whole dataset in memory
  const result = await previewDataset({
    dataset,
    fromLine,
    toLine: toLine || fileMetadata.rowCount,
  }).then((r) => r.unwrap())

  const { rows } = result

  const parameters = rows.map((row) => {
    return Object.fromEntries(
      Object.entries(parametersMap!).map(([key, index]) => [key, row[index]!]),
    )
  })

  const progressTracker = new ProgressTracker(await queues(), batchId)
  const firstAttempt = job.attemptsMade === 0

  if (firstAttempt) {
    await progressTracker.initializeProgress(parameters.length)
  }

  const progress = await progressTracker.getProgress()
  const jobs = await setupJobs()

  if (firstAttempt && parameters.length > 0) {
    websockets.emit('evaluationStatus', {
      workspaceId: workspace.id,
      data: {
        batchId,
        evaluationId: evaluation.id,
        documentUuid: document.documentUuid,
        ...progress,
      },
    })
  }

  // Enqueue runDocumentJob for each set of parameters, starting from the last
  // enqueued job. This allows us to resume the batch if the job fails.
  for (let i = progress.enqueued; i < parameters.length; i++) {
    progressTracker.incrementEnqueued()

    await jobs.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: commit.projectId,
      parameters: parameters[i],
      evaluationId: evaluation.id,
      batchId,
    })
  }

  return { batchId }
}
