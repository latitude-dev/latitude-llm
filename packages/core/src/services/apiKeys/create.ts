import type { Workspace } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { apiKeys } from '../../schema'

export function createApiKey(
  { name, workspace }: { name?: string; workspace: Workspace },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .insert(apiKeys)
      .values({ workspaceId: workspace.id, name })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
