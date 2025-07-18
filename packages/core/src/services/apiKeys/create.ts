import { env } from '@latitude-data/env'
import type { Workspace } from '../../browser'
import { generateUUIDIdentifier } from '../../lib/generateUUID'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema'

export function createApiKey(
  { name, workspace }: { name?: string; workspace: Workspace },
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
    const token =
      env.NODE_ENV === 'development'
        ? env.TEST_LATITUDE_API_KEY
        : generateUUIDIdentifier()
    const result = await tx
      .insert(apiKeys)
      .values({ workspaceId: workspace.id, name, token })
      .returning()

    return Result.ok(result[0]!)
  })
}
