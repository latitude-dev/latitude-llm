import { Job } from 'bullmq'

import { LogSources } from '@latitude-data/constants'
import { type Experiment } from '../../../schema/models/types/Experiment'
import { NotFoundError } from '../../../lib/errors'
import { ExperimentsRepository } from '../../../repositories'
import { isErrorRetryable } from '../../../services/evaluationsV2/run'
import { BACKGROUND } from '../../../telemetry'
import { captureException } from '../../../utils/workers/datadog'
import { queues } from '../../queues'
import { runDocumentAtCommitWithAutoToolResponses } from '../documents/runDocumentAtCommitWithAutoToolResponses'
import {
  RunEvaluationV2JobData,
  runEvaluationV2JobKey,
} from '../evaluations/runEvaluationV2Job'
import { updateExperimentStatus } from './shared'

export type RunDocumentForExperimentJobData = {
  workspaceId: number
  projectId: number
  experimentId: number
  experiment: Experiment
  commitUuid: string
  parameters: Record<string, unknown>
  datasetRowId?: number
}

export const runDocumentForExperimentJob = async (
  job: Job<RunDocumentForExperimentJobData>,
) => {
  const {
    workspaceId,
    experimentId,
    projectId,
    commitUuid,
    parameters,
    datasetRowId,
  } = job.data
  const experimentScope = new ExperimentsRepository(workspaceId)
  const experiment = await experimentScope
    .find(experimentId)
    .then((r) => r.unwrap())
  if (experiment.finishedAt) return

  try {
    const result = await runDocumentAtCommitWithAutoToolResponses({
      context: BACKGROUND({ workspaceId }),
      workspaceId,
      projectId,
      commitUuid,
      documentUuid: experiment.documentUuid,
      customPrompt: experiment.metadata.prompt,
      parameters,
      experiment,
      source: LogSources.Experiment,
    }).then((r) => r.unwrap())

    const providerLog = (await result.lastResponse)?.providerLog
    if (!providerLog) {
      throw new NotFoundError('Provider log not found after running document')
    }

    await updateExperimentStatus(
      {
        workspaceId,
        experiment,
      },
      (progressTracker) =>
        progressTracker.incrementEnqueued(experiment.evaluationUuids.length),
    ).then((r) => r.unwrap())

    const { evaluationsQueue } = await queues()
    experiment.evaluationUuids.forEach((evaluationUuid) => {
      const payload: RunEvaluationV2JobData = {
        workspaceId,
        commitId: experiment.commitId,
        evaluationUuid,
        providerLogUuid: providerLog.uuid,
        datasetId: experiment.datasetId ?? undefined,
        datasetLabel: experiment.metadata.datasetLabels[evaluationUuid],
        datasetRowId,
        experimentUuid: experiment.uuid,
      }

      evaluationsQueue.add('runEvaluationV2Job', payload, {
        deduplication: { id: runEvaluationV2JobKey(payload) },
      })
    })
  } catch (error) {
    if (isErrorRetryable(error as Error)) throw error

    captureException(error as Error)

    await updateExperimentStatus(
      {
        workspaceId,
        experiment,
      },
      (progressTracker) =>
        progressTracker.incrementErrors(experiment.evaluationUuids.length),
    )
  }
}
