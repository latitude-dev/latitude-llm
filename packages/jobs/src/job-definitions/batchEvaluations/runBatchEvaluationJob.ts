import { randomUUID } from 'crypto'

import {
  Dataset,
  DocumentVersion,
  EvaluationDto,
} from '@latitude-data/core/browser'
import { findWorkspaceFromDocument } from '@latitude-data/core/data-access'
import { NotFoundError } from '@latitude-data/core/lib/errors'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { previewDataset } from '@latitude-data/core/services/datasets/preview'
import { Job } from 'bullmq'

import { setupJobs } from '../..'
import { Queues } from '../../constants'
import { connection } from '../../utils/connection'
import { ProgressTracker } from '../../utils/progressTracker'

type RunBatchEvaluationJobParams = {
  evaluation: EvaluationDto
  dataset: Dataset
  document: DocumentVersion
  fromLine?: number
  toLine?: number
  parametersMap?: Record<string, number>
  batchId?: string
}

export const runBatchEvaluationJob = {
  name: 'runBatchEvaluationJob',
  queue: Queues.defaultQueue,
  handler: async (job: Job<RunBatchEvaluationJobParams>) => {
    const {
      evaluation,
      dataset,
      document,
      fromLine = 0,
      toLine,
      parametersMap,
      batchId = randomUUID(),
    } = job.data
    const workspace = await findWorkspaceFromDocument(document)
    if (!workspace) throw new NotFoundError('Workspace not found')

    const commit = await new CommitsRepository(workspace.id)
      .find(document.commitId)
      .then((r) => r.unwrap())
    const fileMetadata = dataset.fileMetadata
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
        Object.entries(parametersMap!).map(([key, index]) => [
          key,
          row[index]!,
        ]),
      )
    })

    const progressTracker = new ProgressTracker(connection, batchId)

    if (job.attemptsMade === 0) {
      await progressTracker.initializeProgress(parameters.length)
    }

    const { enqueued } = await progressTracker.getProgress()
    const queues = setupJobs()

    // Enqueue runDocumentJob for each set of parameters, starting from the last
    // enqueued job. This allows us to resume the batch if the job fails.
    for (let i = enqueued; i < parameters.length; i++) {
      await queues.defaultQueue.jobs.enqueueRunDocumentJob({
        workspaceId: workspace.id,
        document,
        commit,
        parameters: parameters[i]!,
        evaluationId: evaluation.id,
        batchId,
      })

      await progressTracker.incrementEnqueued()
    }

    return { batchId }
  },
}
