import { randomUUID } from 'crypto'

import { Job } from 'bullmq'

import { setupJobs } from '../..'
import {
  Dataset,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
  EvaluationDto,
  User,
  Workspace,
} from '../../../browser'
import { publisher } from '../../../events/publisher'
import { queues } from '../../../queues'
import { CommitsRepository } from '../../../repositories'
import { previewDataset } from '../../../services/datasets/preview'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { getRowsFromRange } from '../../../services/datasetRows/getRowsFromRange'

type GetDatasetsProps = {
  dataset: Dataset | DatasetV2
  fromLine: number | undefined
  toLine: number | undefined
}

async function getDatasetRows({
  dataset: ds,
  fromLine: from,
  toLine: to,
}: GetDatasetsProps) {
  const fromLine = from ? Math.abs(from) : 1
  const datasetVersion = 'columns' in ds ? DatasetVersion.V2 : DatasetVersion.V1

  // DEPRECATED: Used in old datasets
  if (datasetVersion === DatasetVersion.V1) {
    const dataset = ds as Dataset
    const fileMetadata = dataset.fileMetadata
    const result = await previewDataset({
      dataset,
      fromLine,
      toLine: to || fileMetadata.rowCount,
    }).then((r) => r.unwrap())

    return { rows: result.rows }
  }

  return getRowsFromRange({ dataset: ds as DatasetV2, fromLine, toLine: to })
}

type GetParametersProps = GetDatasetsProps & {
  parametersMap?: Record<string, number>
}
export async function getBatchParamaters({
  parametersMap,
  ...props
}: GetParametersProps) {
  if (!parametersMap) return []

  const result = await getDatasetRows(props)
  const { rows } = result

  return rows.map((row) => {
    return Object.fromEntries(
      Object.entries(parametersMap!).map(([key, index]) => [key, row[index]!]),
    )
  })
}

export type RunBatchEvaluationJobParams = {
  workspace: Workspace
  user: User
  evaluation: EvaluationDto
  dataset: Dataset | DatasetV2
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

  publisher.publishLater({
    type: 'batchEvaluationRun',
    data: {
      evaluationId: evaluation.id,
      workspaceId: workspace.id,
      userEmail: user.email,
    },
  })

  const parameters = await getBatchParamaters({
    dataset,
    parametersMap,
    fromLine,
    toLine,
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

    // NOTE: This is running jobs for the document with different parameters
    // then the result is evaluated with `runEvaluationJob`
    await jobs.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      projectId: commit.projectId,
      parameters: parameters[i]!,
      evaluationId: evaluation.id,
      batchId,
    })
  }

  return { batchId }
}
