import { Job } from 'bullmq'
import { unsafelyFindWorkspace } from '../../../data-access'
import {
  CommitsRepository,
  DatasetRowsRepository,
  DatasetsRepository,
  DocumentLogsRepository,
  EvaluationsV2Repository,
  ExperimentsRepository,
  ProviderLogsRepository,
} from '../../../repositories'
import { runEvaluationV2 } from '../../../services/evaluationsV2/run'
import serializeProviderLog from '../../../services/providerLogs/serialize'
import { NotFoundError } from './../../../lib/errors'
import { updateExperimentStatus } from '../experiments/shared'
import { env } from '@latitude-data/env'

export type RunEvaluationV2JobData = {
  workspaceId: number
  commitId: number
  evaluationUuid: string
  providerLogUuid: string
  datasetId?: number
  datasetLabel?: string
  datasetRowId?: number
  batchId?: string // TODO(exps): Deprecated
  experimentUuid?: string
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
    experimentUuid,
  } = job.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const experimentScope = new ExperimentsRepository(workspace.id)
  const experiment = experimentUuid
    ? await experimentScope.findByUuid(experimentUuid).then((r) => r.unwrap())
    : undefined

  try {
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
      const datasetsRepository = new DatasetsRepository(workspace.id)
      dataset = await datasetsRepository.find(datasetId).then((r) => r.unwrap())
    }

    let datasetRow = undefined
    if (datasetRowId) {
      const rowsRepository = new DatasetRowsRepository(workspace.id)
      datasetRow = await rowsRepository
        .find(datasetRowId)
        .then((r) => r.unwrap())
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

    if (experiment) {
      await updateExperimentStatus(
        {
          workspaceId,
          experiment,
        },
        async (progressTracker) => {
          if (result.hasPassed) {
            await progressTracker.incrementCompleted()
            await progressTracker.incrementTotalScore(result.normalizedScore)
          } else {
            await progressTracker.incrementFailed()
          }
        },
      ).then((r) => r.unwrap())
    }
  } catch (error) {
    if (env.NODE_ENV === 'development') {
      console.error(error)
    }

    if (experiment) {
      await updateExperimentStatus(
        {
          workspaceId,
          experiment,
        },
        (progressTracker) => progressTracker.incrementErrors(),
      )
    }
  }
}
