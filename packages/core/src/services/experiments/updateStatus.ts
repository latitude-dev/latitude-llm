import { ProgressTracker } from '../../jobs/utils/progressTracker'
import { LatitudeError } from '../../lib/errors'
import { ErrorResult, Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { ExperimentsRepository } from '../../repositories'
import { type Experiment } from '../../schema/models/types/Experiment'
import { notifyClientOfExperimentStatus } from '../../events/handlers/notifyClientOfExperimentStatus'
import { completeExperiment } from './complete'

type UpdateExperimentStatusData = {
  workspaceId: number
  experiment: Experiment
}

export async function updateExperimentStatus(
  { workspaceId, experiment }: UpdateExperimentStatusData,
  updateProgressFn?: (progressTracker: ProgressTracker) => Promise<void>,
): PromisedResult<undefined, LatitudeError> {
  const progressTracker = new ProgressTracker(experiment.uuid)

  try {
    await updateProgressFn?.(progressTracker)
    const progress = await progressTracker.getProgress()

    if (progress.completed >= progress.total) {
      await progressTracker.cleanup().catch(() => {
        // Silently ignore cleanup errors to not mask the original error
      })

      const completeResult = await completeExperiment({ experiment })
      if (!Result.isOk(completeResult)) {
        return completeResult as ErrorResult<LatitudeError>
      }

      experiment = completeResult.unwrap()
    }

    // Fetch the experiment DTO from the repository to ensure consistent data format
    const experimentsRepository = new ExperimentsRepository(workspaceId)
    const experimentDto = await experimentsRepository
      .findByUuid(experiment.uuid)
      .then((r) => r.unwrap())

    await notifyClientOfExperimentStatus({
      workspaceId,
      experiment: experimentDto,
    })

    return Result.nil()
  } finally {
    // CRITICAL: Always cleanup Redis connection to prevent memory leaks
    await progressTracker.disconnect().catch(() => {
      // Silently ignore cleanup errors to not mask the original error
    })
  }
}

export async function initializeExperimentStatus({
  workspaceId,
  experiment,
  uuids,
}: {
  workspaceId: number
  experiment: Experiment
  uuids: string[]
}): PromisedResult<undefined, LatitudeError> {
  const progressTracker = new ProgressTracker(experiment.uuid)

  try {
    await progressTracker.initializeProgress(
      uuids,
      experiment.evaluationUuids.length,
    )

    // Fetch the experiment DTO from the repository to ensure consistent data format
    const experimentsRepository = new ExperimentsRepository(workspaceId)
    const experimentDto = await experimentsRepository
      .findByUuid(experiment.uuid)
      .then((r) => r.unwrap())

    await notifyClientOfExperimentStatus({
      workspaceId,
      experiment: experimentDto,
    })

    return Result.nil()
  } finally {
    // CRITICAL: Always cleanup Redis connection to prevent memory leaks
    await progressTracker.disconnect().catch(() => {
      // Silently ignore cleanup errors to not mask the original error
    })
  }
}
