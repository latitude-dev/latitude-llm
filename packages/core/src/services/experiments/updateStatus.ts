import { ProgressTracker } from '../../jobs/utils/progressTracker'
import { LatitudeError } from '../../lib/errors'
import { ErrorResult, Result } from '../../lib/Result'
import { PromisedResult } from '../../lib/Transaction'
import { type Experiment } from '../../schema/models/types/Experiment'
import { WebsocketClient } from '../../websockets/workers'
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
  } finally {
    // CRITICAL: Always cleanup Redis connection to prevent memory leaks
    await progressTracker.disconnect().catch(() => {
      // Silently ignore cleanup errors to not mask the original error
    })
  }
}
