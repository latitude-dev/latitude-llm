import { type Experiment } from '../../schema/models/types/Experiment'
import { LatitudeError } from '../../lib/errors'
import { ErrorResult, Result } from '../../lib/Result'
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

  if (progress.completed >= progress.total) {
    const completeResult = await completeExperiment(experiment)
    if (!Result.isOk(completeResult)) {
      return completeResult as ErrorResult<LatitudeError>
    }

    experiment = completeResult.unwrap()
    await progressTracker.cleanup()
  }

  WebsocketClient.sendEvent('experimentStatus', {
    workspaceId,
    data: {
      experiment: {
        ...experiment,
        results: progress,
      },
    },
  })

  return Result.nil()
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
  await progressTracker.initializeProgress(
    uuids,
    experiment.evaluationUuids.length,
  )
  const progress = await progressTracker.getProgress()

  WebsocketClient.sendEvent('experimentStatus', {
    workspaceId,
    data: {
      experiment: {
        ...experiment,
        results: progress,
      },
    },
  })

  return Result.nil()
}
