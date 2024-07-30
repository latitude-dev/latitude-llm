import type { Workspace } from '$core/browser'
import { database } from '$core/client'
import { Result, Transaction } from '$core/lib'
import { apiKeys } from '$core/schema'

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
