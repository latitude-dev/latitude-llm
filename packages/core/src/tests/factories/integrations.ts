import { faker } from '@faker-js/faker'

import { DatabaseError } from 'pg'
import { IntegrationDto, Workspace } from '../../browser'
import { database } from '../../client'
import { IntegrationsRepository } from '../../repositories'
import { integrations } from '../../schema'
import { IntegrationConfiguration } from '../../services/integrations/helpers/schema'

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
  try {
    const res = await database
      .insert(integrations)
      .values({
        workspaceId: workspace.id,
        name,
        type,
        configuration:
          configuration as IntegrationConfiguration['configuration'],
        authorId: workspace.creatorId ?? '',
      })
      .returning()
      .then((r) => r[0]!)

    const integrationsRepo = new IntegrationsRepository(workspace.id, database)

    const result = await integrationsRepo.find(res.id)
    return result.unwrap()
  } catch (e) {
    if ('cause' in (e as Error)) {
      throw (e as DatabaseError).cause
    } else {
      throw e
    }
  }
}
