import { eq } from 'drizzle-orm'
import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { LatitudeError, NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import {
  ExperimentsRepository,
  OptimizationsRepository,
} from '../../repositories'
import { experiments } from '../../schema/models/experiments'
import { type Experiment } from '../../schema/models/types/Experiment'
import { endValidateOptimization } from '../optimizations/validate/end'

export async function completeExperiment(
  { experiment, cancelled }: { experiment: Experiment; cancelled?: boolean },
  transaction = new Transaction(),
): PromisedResult<Experiment, Error> {
  const completing = await transaction.call(async (tx) => {
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
  if (completing.error) {
    return Result.error(completing.error)
  }

  experiment = completing.value

  // Note: this cannot be inside the transaction's callback because
  // it access the database and the transaction class messes up with
  // the connection and it says its terminated
  if (!cancelled) {
    await processOptimization({ experiment })
  }

  return Result.ok(experiment)
}

async function processOptimization({ experiment }: { experiment: Experiment }) {
  const workspace = await unsafelyFindWorkspace(experiment.workspaceId)
  if (!workspace) {
    return Result.error(new LatitudeError('Workspace not found'))
  }

  const optimizationsRepository = new OptimizationsRepository(workspace.id)
  const findingop = await optimizationsRepository.findByExperiment(
    experiment.id,
  )
  if (findingop.error) {
    if (findingop.error instanceof NotFoundError) {
      return Result.nil()
    }

    return Result.error(findingop.error)
  }
  const optimization = findingop.value

  const otherExperimentId =
    optimization.baselineExperimentId === experiment.id
      ? optimization.optimizedExperimentId
      : optimization.baselineExperimentId

  const experimentsRepository = new ExperimentsRepository(workspace.id)
  const findingex = await experimentsRepository.find(otherExperimentId)
  if (findingex.error) {
    return Result.error(findingex.error)
  }
  const otherExperiment = findingex.value

  if (experiment.finishedAt && otherExperiment.finishedAt) {
    const ending = await endValidateOptimization({ optimization, workspace })
    if (ending.error) {
      return Result.error(ending.error)
    }
  }

  return Result.nil()
}
