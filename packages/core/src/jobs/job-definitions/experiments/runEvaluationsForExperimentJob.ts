import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { EvaluationV2 } from '@latitude-data/constants'
import { Experiment, ProviderLogDto } from '../../../browser'
import { runEvaluationV2 } from '../../../services/evaluationsV2'
import {
  CommitsRepository,
  DatasetRowsRepository,
  DatasetsRepository,
} from '../../../repositories'
import { unsafelyFindWorkspace } from '../../../data-access'
import { updateExperimentStatus } from './shared'

export type RunEvaluationsForExperimentJobData = {
  workspaceId: number
  projectId: number
  commitUuid: string
  experiment: Experiment
  providerLog: ProviderLogDto
  evaluation: EvaluationV2
  datasetRowId: number
}

export function runEvaluationsForExperimentJobKey({
  workspaceId,
  projectId,
  commitUuid,
  experiment,
  providerLog,
  evaluation,
  datasetRowId,
}: RunEvaluationsForExperimentJobData) {
  return `runEvaluationsForExperimentJob-${workspaceId}-${projectId}-${commitUuid}-${experiment.uuid}-${providerLog.uuid}-${evaluation.uuid}-${datasetRowId}`
}

export const runEvaluationsForExperimentJob = async (
  job: Job<RunEvaluationsForExperimentJobData>,
) => {
  const {
    workspaceId,
    projectId,
    commitUuid,
    experiment,
    providerLog,
    evaluation,
    datasetRowId,
  } = job.data

  try {
    const workspace = await unsafelyFindWorkspace(workspaceId)

    const commitScope = new CommitsRepository(workspaceId)
    const commit = await commitScope
      .getCommitByUuid({ projectId, uuid: commitUuid })
      .then((r) => r.unwrap())

    const datasetsScope = new DatasetsRepository(workspaceId)
    const dataset = await datasetsScope
      .find(experiment.datasetId)
      .then((r) => r.unwrap())

    const datasetRowScope = new DatasetRowsRepository(workspaceId)
    const datasetRow = await datasetRowScope
      .find(datasetRowId)
      .then((r) => r.unwrap())

    const evalResult = await runEvaluationV2({
      workspace: workspace!,
      evaluation,
      commit,
      providerLog,
      experiment,
      dataset,
      datasetRow,
      datasetLabel: experiment.metadata.expectedOutputColumn,
    }).then((r) => r.unwrap())

    await updateExperimentStatus(
      {
        workspaceId,
        experiment,
      },
      async (progressTracker) => {
        if (evalResult.result.hasPassed) {
          await progressTracker.incrementCompleted()
          await progressTracker.incrementTotalScore(
            evalResult.result.normalizedScore,
          )
        } else {
          await progressTracker.incrementFailed()
        }
      },
    ).then((r) => r.unwrap())
  } catch (error) {
    if (env.NODE_ENV === 'development') {
      console.error(error)
    }

    await updateExperimentStatus(
      {
        workspaceId,
        experiment,
      },
      (progressTracker) => progressTracker.incrementErrors(),
    )
  }
}
