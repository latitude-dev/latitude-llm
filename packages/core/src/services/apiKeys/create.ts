import type { Workspace } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { apiKeys } from '../../schema'
import { env } from '@latitude-data/env'
import { generateUUIDIdentifier } from '../../lib/generateUUID'

export function createApiKey(
  { name, workspace }: { name?: string; workspace: Workspace },
  db = database,
) {
  return Transaction.call(async (tx) => {
    const token =
      env.NODE_ENV === 'development'
        ? env.TEST_LATITUDE_API_KEY
        : generateUUIDIdentifier()
    const result = await tx
      .insert(apiKeys)
      .values({ workspaceId: workspace.id, name, token })
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
