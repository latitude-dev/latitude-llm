import { Result } from '../../../../lib/Result'
import { ExperimentsRepository } from '../../../../repositories'
import { Experiment } from '../../../../schema/models/types/Experiment'
import { updateExperimentStatus } from '../../../../services/experiments/updateStatus'
import { isFeatureEnabledByName } from '../../../../services/workspaceFeatures/isFeatureEnabledByName'
import { queues } from '../../../queues'
import { RunEvaluationForExperimentJobData } from '../../evaluations/runEvaluationForExperimentJob'

/**
 * Fetches an experiment by ID if provided
 */
export async function fetchExperiment({
  workspaceId,
  experimentId,
}: {
  workspaceId: number
  experimentId?: number
}): Promise<Experiment | undefined> {
  if (!experimentId) return undefined

  const experimentsRepository = new ExperimentsRepository(workspaceId)
  const experiment = await experimentsRepository.find(experimentId)
  return experiment.unwrap()
}

type HandleExperimentSuccessArgs = {
  experiment: Experiment
  workspaceId: number
  workspace: { id: number }
  runUuid: string
  conversationUuid: string
  datasetRowId?: number
}

/**
 * Handles post-run processing for experiments including:
 * 1. Marking the document run as finished (success)
 * 2. Enqueueing evaluation jobs for each configured evaluation
 */
export async function handleExperimentSuccess({
  experiment,
  workspaceId,
  workspace,
  runUuid,
  conversationUuid,
  datasetRowId,
}: HandleExperimentSuccessArgs) {
  await updateExperimentStatus(
    {
      workspaceId,
      experiment,
    },
    (progressTracker) => progressTracker.documentRunFinished(runUuid, true),
  )

  const evaluationsDisabledResult = await isFeatureEnabledByName(
    workspace.id,
    'evaluationsDisabled',
  )

  const evaluationsDisabled = evaluationsDisabledResult.unwrap()
  if (evaluationsDisabled) {
    return Result.nil()
  }

  const { evaluationsQueue } = await queues()
  const parametersSource = experiment.metadata.parametersSource
  const datasetLabels =
    parametersSource.source === 'dataset' ? parametersSource.datasetLabels : {}

  try {
    const results = await Promise.all(
      experiment.evaluationUuids.map((evaluationUuid) => {
        const payload: RunEvaluationForExperimentJobData = {
          workspaceId,
          datasetRowId,
          evaluationUuid,
          conversationUuid,
          experimentUuid: experiment.uuid,
          commitId: experiment.commitId,
          datasetId: experiment.datasetId ?? undefined,
          datasetLabel: datasetLabels[evaluationUuid],
        }

        return evaluationsQueue.add('runEvaluationForExperimentJob', payload)
      }),
    )
    return Result.ok(results)
  } catch (err) {
    return Result.error(err as Error)
  }
}

type MarkExperimentFailureArgs = {
  experiment: Experiment
  workspaceId: number
  runUuid: string
}

/**
 * Marks an experiment document run as failed
 */
export async function markExperimentFailure({
  experiment,
  workspaceId,
  runUuid,
}: MarkExperimentFailureArgs) {
  await updateExperimentStatus(
    {
      workspaceId,
      experiment,
    },
    (progressTracker) => progressTracker.documentRunFinished(runUuid, false),
  )
}
