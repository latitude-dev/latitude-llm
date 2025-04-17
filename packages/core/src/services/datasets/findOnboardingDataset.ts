import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { DatasetsRepository } from '../../repositories'

const ONBOARDING_DATASET_NAME = 'onboarding dataset'

export async function findOnboardingDataset(workspaceId: number) {
  try {
    const datasetsRepo = new DatasetsRepository(workspaceId)
    const datasets = await datasetsRepo.findByName(ONBOARDING_DATASET_NAME)

    const dataset = datasets[0]
    if (!dataset) {
      return Result.error(
        new NotFoundError('Onboarding dataset not found in the workspace'),
      )
    }

    return Result.ok(dataset)
  } catch (error) {
    return Result.error(error as Error)
  }
}
