import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { type Experiment } from '../../schema/models/types/Experiment'
import { completeExperiment } from './complete'

// FIXME: This is not really stopping the experiment, it's just completing it (and it keeps running)...
export async function stopExperiment(
  experiment: Experiment,
  transaction = new Transaction(),
): PromisedResult<Experiment, Error> {
  if (experiment.finishedAt) {
    return Result.ok(experiment)
  }

  return await completeExperiment({ experiment, cancelled: true }, transaction)
}
