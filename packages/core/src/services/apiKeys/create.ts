import type { Workspace } from '../../schema/types'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema/models/apiKeys'

export function createApiKey(
  { name, workspace }: { name?: string; workspace: Workspace },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const token = generateUUIDIdentifier()
    const result = await tx
      .insert(apiKeys)
      .values({ workspaceId: workspace.id, name, token })
      .returning()

    return Result.ok(result[0]!)
  })
}
