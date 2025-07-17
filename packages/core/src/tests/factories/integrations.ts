import { faker } from '@faker-js/faker'

import { IntegrationDto, Workspace } from '../../browser'
import { database } from '../../client'
import { IntegrationConfiguration } from '../../services/integrations/helpers/schema'
import { IntegrationProviderConfig, integrations } from '../../schema'
import { IntegrationsRepository } from '../../repositories'

export type ICreateIntegration = {
  workspace: Workspace
  name?: string
} & IntegrationConfiguration

export async function createIntegration({
  workspace,
  name = faker.word.sample(),
  type,
  configuration,
}: ICreateIntegration): Promise<IntegrationDto> {
  const res = await database
    .insert(integrations)
    .values({
      workspaceId: workspace.id,
      name,
      type,
      configuration: configuration as IntegrationProviderConfig,
      authorId: workspace.creatorId ?? '',
    })
    .returning()
    .then((r) => r[0]!)

  const integrationsRepo = new IntegrationsRepository(workspace.id, database)
  const result = await integrationsRepo.find(res.id)
  return result.unwrap()
}
