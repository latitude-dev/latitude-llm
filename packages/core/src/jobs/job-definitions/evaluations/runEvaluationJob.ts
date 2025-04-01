import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access'
import { NotFoundError } from '../../../lib'
import { queuesConnection } from '../../../queues'
import {
  CommitsRepository,
  DatasetRowsRepository,
  DatasetsV2Repository,
  DocumentLogsRepository,
  EvaluationsV2Repository,
  ProviderLogsRepository,
} from '../../../repositories'
import { runEvaluationV2 } from '../../../services/evaluationsV2'
import serializeProviderLog from '../../../services/providerLogs/serialize'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'

export type RunEvaluationV2JobData = {
  workspaceId: number
  commitId: number
  evaluationUuid: string
  providerLogUuid: string
  datasetId?: number
  datasetLabel?: string
  datasetRowId?: number
  batchId?: string // TODO: Replace with experiments when they exists
}

export function runEvaluationV2JobKey({
  workspaceId,
  commitId,
  evaluationUuid,
  providerLogUuid,
  datasetId,
  datasetLabel,
  datasetRowId,
}: RunEvaluationV2JobData) {
  return `runEvaluationV2Job-${workspaceId}-${commitId}-${evaluationUuid}-${providerLogUuid}-${datasetId}-${datasetLabel}-${datasetRowId}`
}

export const runEvaluationV2Job = async (job: Job<RunEvaluationV2JobData>) => {
  const {
    workspaceId,
    commitId,
    evaluationUuid,
    providerLogUuid,
    datasetId,
    datasetLabel,
    datasetRowId,
    batchId,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitById(commitId)
    .then((r) => r.unwrap())

  const providerLogsRepository = new ProviderLogsRepository(workspace.id)
  const providerLog = await providerLogsRepository
    .findByUuid(providerLogUuid)
    .then((r) => r.unwrap())
    .then((r) => serializeProviderLog(r))

  const documentLogsRepository = new DocumentLogsRepository(workspace.id)
  const documentLog = await documentLogsRepository
    .findByUuid(providerLog.documentLogUuid!)
    .then((r) => r.unwrap())

  const evaluationsRepository = new EvaluationsV2Repository(workspace.id)
  const evaluation = await evaluationsRepository
    .getAtCommitByDocument({
      commitUuid: commit.uuid,
      documentUuid: documentLog.documentUuid,
      evaluationUuid: evaluationUuid,
    })
    .then((r) => r.unwrap())

  let dataset = undefined
  if (datasetId) {
    const datasetsRepository = new DatasetsV2Repository(workspace.id)
    dataset = await datasetsRepository.find(datasetId).then((r) => r.unwrap())
  }

  let datasetRow = undefined
  if (datasetRowId) {
    const rowsRepository = new DatasetRowsRepository(workspace.id)
    datasetRow = await rowsRepository.find(datasetRowId).then((r) => r.unwrap())
  }

  const { result } = await runEvaluationV2({
    evaluation: evaluation,
    providerLog: providerLog,
    dataset: dataset,
    datasetLabel: datasetLabel,
    datasetRow: datasetRow,
    commit: commit,
    workspace: workspace,
  }).then((r) => r.unwrap())

  // TODO: Replace with experiments when they exists
  if (batchId) {
    const websockets = await WebsocketClient.getSocket()
    const tracker = new ProgressTracker(await queuesConnection(), batchId)
    if (!tracker) return

    if (result.error) await tracker.incrementErrors()
    else await tracker.incrementCompleted()

    const progress = await tracker.getProgress()

    websockets.emit('evaluationStatus', {
      workspaceId,
      data: {
        batchId: batchId,
        commitId: commit.id,
        documentUuid: documentLog.documentUuid,
        evaluationUuid: evaluation.uuid,
        version: 'v2',
        ...progress,
      },
    })
  }
}
