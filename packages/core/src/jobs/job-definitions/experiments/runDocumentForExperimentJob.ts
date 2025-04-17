import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { LogSources } from '@latitude-data/constants'
import { NotFoundError } from '../../../lib/errors'
import { evaluationsQueue } from '../../queues'
import { Experiment } from '../../../browser'
import { updateExperimentStatus } from './shared'
import { runDocumentAtCommitWithAutoToolResponses } from '../documents/runDocumentAtCommitWithAutoToolResponses'
import { ExperimentsRepository } from '../../../repositories'
import { RunEvaluationV2JobData, runEvaluationV2JobKey } from '../evaluations'

export type RunDocumentForExperimentJobData = {
  workspaceId: number
  projectId: number
  experimentId: number
  experiment: Experiment
  commitUuid: string
  prompt: string
  parameters: Record<string, unknown>
  datasetRowId: number
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
    prompt,
    datasetRowId,
  } = job.data
  const experimentScope = new ExperimentsRepository(workspaceId)
  const experiment = await experimentScope
    .find(experimentId)
    .then((r) => r.unwrap())

  try {
    const result = await runDocumentAtCommitWithAutoToolResponses({
      workspaceId,
      projectId,
      commitUuid,
      documentUuid: experiment.documentUuid,
      customPrompt: prompt,
      parameters,
      experiment,
      autoRespondToolCalls: true,
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

    experiment.evaluationUuids.forEach((evaluationUuid) => {
      const payload: RunEvaluationV2JobData = {
        workspaceId,
        commitId: experiment.commitId,
        evaluationUuid,
        providerLogUuid: providerLog.uuid,
        datasetId: experiment.datasetId,
        datasetLabel: experiment.metadata.datasetLabels[evaluationUuid],
        datasetRowId,
        experimentUuid: experiment.uuid,
      }

      evaluationsQueue.add('runEvaluationV2Job', payload, {
        deduplication: { id: runEvaluationV2JobKey(payload) },
      })
    })
  } catch (error) {
    if (env.NODE_ENV === 'development') {
      console.error(error)
    }

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
