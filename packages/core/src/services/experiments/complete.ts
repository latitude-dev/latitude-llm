import { type Experiment } from '../../schema/models/types/Experiment'
import { LatitudeError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { experiments } from '../../schema/models/experiments'
import { eq } from 'drizzle-orm'

export async function completeExperiment(
  experiment: Experiment,
  transaction = new Transaction(),
): PromisedResult<Experiment, Error> {
  return transaction.call(async (tx) => {
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
}
