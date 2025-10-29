import { type Experiment } from '../../schema/models/types/Experiment'
import { LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { completeExperiment } from './complete'
import { WebsocketClient } from '../../websockets/workers'
import { ProgressTracker } from '../../jobs/utils/progressTracker'

type UpdateExperimentStatusData = {
  workspaceId: number
  experiment: Experiment
}

export async function updateExperimentStatus(
  { workspaceId, experiment }: UpdateExperimentStatusData,
  updateProgressFn?: (progressTracker: ProgressTracker) => Promise<void>,
): PromisedResult<undefined, LatitudeError> {
  const progressTracker = new ProgressTracker(experiment.uuid)

  await updateProgressFn?.(progressTracker)
  const progress = await progressTracker.getProgress()
  await progressTracker.cleanup()

  const expectedTotal =
    experiment.metadata.count * experiment.evaluationUuids.length

  const current = progress.completed + progress.failed + progress.errors
  if (current >= expectedTotal) {
    // Experiment has been completed
    const completeResult = await completeExperiment(experiment)
    if (completeResult.error) {
      return Result.error(completeResult.error as LatitudeError)
    }

    experiment = completeResult.unwrap()
  }

  WebsocketClient.sendEvent('experimentStatus', {
    workspaceId,
    data: {
      experiment: {
        ...experiment,
        results: {
          passed: progress.completed,
          failed: progress.failed,
          errors: progress.errors,
          totalScore: progress.totalScore,
        },
      },
    },
  })

  return Result.nil()
}
