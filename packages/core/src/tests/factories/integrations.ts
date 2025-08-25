import { faker } from '@faker-js/faker'

import type { IntegrationDto, Workspace } from '../../browser'
import { database } from '../../client'
import type { IntegrationConfiguration } from '../../services/integrations/helpers/schema'
import { integrations } from '../../schema'
import { IntegrationsRepository } from '../../repositories'
import type { DatabaseError } from 'pg'

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
        configuration: configuration as IntegrationConfiguration['configuration'],
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
