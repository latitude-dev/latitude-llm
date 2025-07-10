import { Experiment } from '../../browser'
import { database } from '../../client'
import { LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { experiments } from '../../schema'
import { eq } from 'drizzle-orm'
import { WebsocketClient } from '../../websockets/workers'
import { ProgressTracker } from '../../jobs/utils/progressTracker'

export async function completeExperiment(
  experiment: Experiment,
  db = database,
): PromisedResult<Experiment, LatitudeError> {
  const updateResult = await Transaction.call(async (tx) => {
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
  }, db)

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
