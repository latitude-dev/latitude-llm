import { ExperimentsRepository } from '../../../../repositories'
import { completeExperiment } from '../../../../services/experiments/complete'

export async function completeExperimentActivityHandler({
  workspaceId,
  experimentId,
}: {
  workspaceId: number
  experimentId: number
}): Promise<void> {
  const experimentsRepository = new ExperimentsRepository(workspaceId)
  const experiment = await experimentsRepository
    .find(experimentId)
    .then((r) => r.unwrap())

  await completeExperiment({ experiment }).then((r) => r.unwrap())
}
