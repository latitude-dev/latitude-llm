import { eq } from 'drizzle-orm'
import { Experiment } from '../../browser'
import { ProgressTracker } from '../../jobs/utils/progressTracker'
import { LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { experiments } from '../../schema'
import { WebsocketClient } from '../../websockets/workers'

export async function completeExperiment(
  experiment: Experiment,
  transaction = new Transaction(),
): PromisedResult<Experiment, LatitudeError> {
  const updateResult = await transaction.call(async (tx) => {
    const result = await tx
      .update(experiments)
      .set({
        finishedAt: new Date(),
      })
      .where(eq(experiments.id, experiment.id))
      .returning()

    if (!result.length) {
      return Result.error(new LatitudeError('Failed to update experiment'))
    }

    return Result.ok(result[0]! as Experiment)
  })

  if (updateResult.error) {
    return Result.error(updateResult.error as LatitudeError)
  }

  const progressTracker = new ProgressTracker(experiment.uuid)
  const progress = await progressTracker.getProgress()

  WebsocketClient.sendEvent('experimentStatus', {
    workspaceId: experiment.workspaceId,
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

  return updateResult
}
