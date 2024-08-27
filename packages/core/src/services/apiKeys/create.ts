import type { Workspace } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { apiKeys } from '../../schema'

export function createApiKey(
  { workspace }: { workspace: Workspace },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(apiKeys)
      .values({ workspaceId: workspace.id })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
