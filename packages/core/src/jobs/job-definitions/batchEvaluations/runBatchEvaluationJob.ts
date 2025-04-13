import { randomUUID } from 'crypto'

import { Job } from 'bullmq'

import {
  Dataset,
  DocumentVersion,
  EvaluationTmp,
  User,
  Workspace,
} from '../../../browser'
import { CommitsRepository } from '../../../repositories'
import { getRowsFromRange } from '../../../services/datasetRows/getRowsFromRange'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'
import { publisher } from '../../../events/publisher'
import { documentsQueue } from '../../queues'
import { getEvaluationMetricSpecification } from '../../../services/evaluationsV2/specs'

type GetDatasetsProps = {
  dataset: Dataset
  fromLine: number | undefined
  toLine: number | undefined
}

async function getDatasetRows({
  dataset: ds,
  fromLine: from,
  toLine: to,
}: GetDatasetsProps) {
  const fromLine = from ? Math.abs(from) : 1
  return getRowsFromRange({ dataset: ds as Dataset, fromLine, toLine: to })
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
          return [
            parameter,
            (row.values as Record<string, string>)[
              dataset.columns[index]!.identifier
            ]!,
          ]
        }),
      ),
    }
  })
}

export type RunBatchEvaluationJobParams = {
  workspace: Workspace
  user: User
  evaluation: EvaluationTmp
  dataset: Dataset
  datasetLabel?: string
  document: DocumentVersion
  commitUuid: string
  projectId: number
  autoRespondToolCalls: boolean
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
    datasetLabel,
    document,
    projectId,
    commitUuid,
    fromLine,
    toLine,
    parametersMap,
    batchId = randomUUID(),
    autoRespondToolCalls,
  } = job.data
  const websockets = await WebsocketClient.getSocket()
  const commit = await new CommitsRepository(workspace.id)
    .getCommitByUuid({ projectId, uuid: commitUuid })
    .then((r) => r.unwrap())

  if (evaluation.version === 'v2') {
    const specification = getEvaluationMetricSpecification(evaluation)
    if (datasetLabel && !dataset.columns.find((c) => c.name === datasetLabel)) {
      throw new Error(`${datasetLabel} is not a valid dataset column`)
    }
    if (!specification.supportsBatchEvaluation) {
      throw new Error('Evaluation does not support batch evaluation')
    }

    if (specification.requiresExpectedOutput && !datasetLabel) {
      throw new Error('Evaluation requires a dataset label')
    }

    publisher.publishLater({
      type: 'batchEvaluationRun',
      data: {
        commitId: commit.id,
        documentUuid: document.documentUuid,
        evaluationUuid: evaluation.uuid,
        workspaceId: workspace.id,
        userEmail: user.email,
        autoRespondToolCalls,
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
        autoRespondToolCalls,
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

  const progressTracker = new ProgressTracker(batchId)
  try {
    const firstAttempt = job.attemptsMade === 0

    if (firstAttempt) {
      await progressTracker.initializeProgress(rows.length)
    }

    let progress = await progressTracker.getProgress()

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
      await progressTracker.incrementEnqueued()

      // NOTE: This is running jobs for the document with different parameters
      // then the result is evaluated with `runEvaluationJob`
      await documentsQueue.add('runDocumentForEvaluationJob', {
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
              datasetLabel: datasetLabel,
              datasetRowId: rows[i]!.id,
            }
          : { evaluationId: evaluation.id }),
        version: evaluation.version,
        batchId,
        autoRespondToolCalls,
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
  } finally {
    await progressTracker.cleanup()
  }
}
