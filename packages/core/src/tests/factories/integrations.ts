import { faker } from '@faker-js/faker'

import { IntegrationDto } from '../../schema/models/types/Integration'
import { type Workspace } from '../../schema/models/types/Workspace'
import { database } from '../../client'
import { IntegrationConfiguration } from '../../services/integrations/helpers/schema'
import { integrations } from '../../schema/models/integrations'
import { findIntegrationById } from '../../queries/integrations/findById'
import { DatabaseError } from 'pg'

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

    return findIntegrationById(
      { workspaceId: workspace.id, id: res.id },
      database,
    )
  } catch (e) {
    if ('cause' in (e as Error)) {
      throw (e as DatabaseError).cause
    } else {
      throw e
    }
  }
}
