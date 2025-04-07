import { env } from '@latitude-data/env'
import { Job } from 'bullmq'

import { EvaluationV2, LogSources } from '@latitude-data/constants'
import { NotFoundError } from '../../../lib/errors'
import { runDocumentAtCommitWithAutoToolResponses } from '../documents/runDocumentAtCommitWithAutoToolResponses'
import { evaluationsQueue } from '../../queues'
import { Experiment, ProviderLogDto } from '../../../browser'
import {
  RunEvaluationsForExperimentJobData,
  runEvaluationsForExperimentJobKey,
} from './runEvaluationsForExperimentJob'
import { updateExperimentStatus } from './shared'

export type RunDocumentForExperimentJobData = {
  workspaceId: number
  projectId: number
  experiment: Experiment
  commitUuid: string
  prompt: string
  parameters: Record<string, unknown>
  datasetRowId: number
  evaluations: EvaluationV2[]
}

export const runDocumentForExperimentJob = async (
  job: Job<RunDocumentForExperimentJobData>,
) => {
  const {
    workspaceId,
    experiment,
    projectId,
    commitUuid,
    parameters,
    prompt,
    datasetRowId,
    evaluations,
  } = job.data
  try {
    const result = await runDocumentAtCommitWithAutoToolResponses({
      workspaceId,
      projectId,
      commitUuid,
      documentUuid: experiment.documentUuid,
      customPrompt: prompt,
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
        progressTracker.incrementEnqueued(evaluations.length),
    ).then((r) => r.unwrap())

    evaluations.forEach((evaluation) => {
      const payload: RunEvaluationsForExperimentJobData = {
        workspaceId,
        projectId,
        commitUuid,
        experiment,
        providerLog: providerLog as unknown as ProviderLogDto,
        evaluation,
        datasetRowId,
      }

      evaluationsQueue.add('runEvaluationsForExperimentJob', payload, {
        deduplication: { id: runEvaluationsForExperimentJobKey(payload) },
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
      (progressTracker) => progressTracker.incrementErrors(evaluations.length),
    )
  }
}
