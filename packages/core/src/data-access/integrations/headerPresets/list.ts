import { IntegrationHeaderPresetsRepository } from '../../../repositories'
import { IntegrationHeaderPreset } from '../../../schema/models/types/IntegrationHeaderPreset'
import { TypedResult } from '../../../lib/Result'

export async function listIntegrationHeaderPresets(
  workspaceId: number,
  integrationId: number,
): Promise<TypedResult<IntegrationHeaderPreset[], Error>> {
  const repository = new IntegrationHeaderPresetsRepository(workspaceId)
  return repository.findByIntegration(integrationId)
}
