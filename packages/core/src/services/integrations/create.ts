import { IntegrationType } from '@latitude-data/constants'
import type { User, Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { integrations } from '../../schema'
import { CustomMCPConfiguration } from './helpers/schema'

export function createIntegration(
  {
    workspace,
    name,
    type,
    configuration,
    author,
  }: {
    workspace: Workspace
    name: string
    type: IntegrationType
    configuration: CustomMCPConfiguration
    author: User
  },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(integrations)
      .values({
        workspaceId: workspace.id,
        name,
        type,
        configuration,
        authorId: author.id,
      })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
