import { Experiment } from '../../../browser'
import { LatitudeError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { completeExperiment } from '../../../services/experiments/complete'
import { WebsocketClient } from '../../../websockets/workers'
import { ProgressTracker } from '../../utils/progressTracker'

type UpdateExperimentStatusData = {
  workspaceId: number
  experiment: Experiment
}

export async function updateExperimentStatus(
  { workspaceId, experiment }: UpdateExperimentStatusData,
  updateProgressFn?: (progressTracker: ProgressTracker) => Promise<void>,
): PromisedResult<undefined, LatitudeError> {
  const websockets = await WebsocketClient.getSocket()
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

  websockets.emit('experimentStatus', {
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
