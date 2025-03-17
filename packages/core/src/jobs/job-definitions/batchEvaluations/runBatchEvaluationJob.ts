import { randomUUID } from 'crypto'

import { Job } from 'bullmq'

import { setupQueues } from '../..'
import {
  Dataset,
  DatasetV2,
  DatasetVersion,
  DocumentVersion,
  EvaluationTmp,
  User,
  Workspace,
} from '../../../browser'
import { publisher } from '../../../events/publisher'
import { queuesConnection } from '../../../queues'
import { CommitsRepository } from '../../../repositories'
import { getRowsFromRange } from '../../../services/datasetRows/getRowsFromRange'
import { previewDataset } from '../../../services/datasets/preview'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'

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

    const rows = result.rows.map((row, index) => ({ id: index, values: row }))
    return { rows }
  }

  return getRowsFromRange({ dataset: ds as DatasetV2, fromLine, toLine: to })
}

type GetParametersProps = GetDatasetsProps & {
  parametersMap?: Record<string, number>
}
export async function getBatchRows({
  parametersMap,
  dataset,
  ...props
}: GetParametersProps) {
  if (!parametersMap) return []

  const { rows } = await getDatasetRows({ ...props, dataset })

  return rows.map((row) => {
    return {
      id: row.id,
      parameters: Object.fromEntries(
        Object.entries(parametersMap!).map(([parameter, index]) => {
          if ('columns' in dataset) {
            return [
              parameter,
              (row.values as Record<string, string>)[
                dataset.columns[index]!.identifier
              ]!,
            ]
          }
          return [parameter, (row.values as string[])[index]!]
        }),
      ),
    }
  })
}

export type RunBatchEvaluationJobParams = {
  workspace: Workspace
  user: User
  evaluation: EvaluationTmp
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

  if (evaluation.version === 'v2') {
    if (!('columns' in dataset)) {
      throw new Error('Cannot run a batch evaluation without a dataset v2')
    }

    publisher.publishLater({
      type: 'batchEvaluationRun',
      data: {
        commitId: commit.id,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
        workspaceId: workspace.id,
        userEmail: user.email,
        version: 'v2',
      },
    })
  } else {
    publisher.publishLater({
      type: 'batchEvaluationRun',
      data: {
        evaluationId: evaluation.id,
        workspaceId: workspace.id,
        userEmail: user.email,
        version: 'v1',
      },
    })
  }

  const rows = await getBatchRows({
    dataset,
    parametersMap,
    fromLine,
    toLine,
  })

  const progressTracker = new ProgressTracker(await queuesConnection(), batchId)
  const firstAttempt = job.attemptsMade === 0

  if (firstAttempt) {
    await progressTracker.initializeProgress(rows.length)
  }

  let progress = await progressTracker.getProgress()
  const queues = await setupQueues()

  if (firstAttempt && rows.length > 0) {
    if (evaluation.version === 'v2') {
      websockets.emit('evaluationStatus', {
        workspaceId: workspace.id,
        data: {
          batchId,
          commitId: commit.id,
          documentUuid: document.documentUuid,
          evaluationUuid: evaluation.uuid,
          version: 'v2',
          ...progress,
        },
      })
    } else {
      websockets.emit('evaluationStatus', {
        workspaceId: workspace.id,
        data: {
          batchId,
          evaluationId: evaluation.id,
          documentUuid: document.documentUuid,
          version: 'v1',
          ...progress,
        },
      })
    }
  }

  // Enqueue runDocumentJob for each set of parameters, starting from the last
  // enqueued job. This allows us to resume the batch if the job fails.
  for (let i = progress.enqueued; i < rows.length; i++) {
    progressTracker.incrementEnqueued()

    // NOTE: This is running jobs for the document with different parameters
    // then the result is evaluated with `runEvaluationJob`
    await queues.defaultQueue.jobs.enqueueRunDocumentForEvaluationJob({
      workspaceId: workspace.id,
      documentUuid: document.documentUuid,
      commitUuid: commit.uuid,
      commitId: commit.id,
      projectId: commit.projectId,
      parameters: rows[i]!.parameters,
      ...(evaluation.version === 'v2'
        ? {
            evaluationUuid: evaluation.uuid,
            datasetId: dataset.id,
            rowId: rows[i]!.id,
          }
        : { evaluationId: evaluation.id }),
      version: evaluation.version,
      batchId,
    })

    progress = await progressTracker.getProgress()

    if (evaluation.version === 'v2') {
      websockets.emit('evaluationStatus', {
        workspaceId: workspace.id,
        data: {
          batchId,
          commitId: commit.id,
          documentUuid: document.documentUuid,
          evaluationUuid: evaluation.uuid,
          version: 'v2',
          ...progress,
        },
      })
    } else {
      websockets.emit('evaluationStatus', {
        workspaceId: workspace.id,
        data: {
          batchId,
          evaluationId: evaluation.id,
          documentUuid: document.documentUuid,
          version: 'v1',
          ...progress,
        },
      })
    }
  }

  return { batchId }
}
