import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { type ApiKey } from '../../schema/models/types/ApiKey'
import { apiKeys } from '../../schema/models/apiKeys'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const findApiKeyByToken = scopedQuery(async function findApiKeyByToken(
  { workspaceId, token }: { workspaceId: number; token: string },
  db,
): Promise<ApiKey> {
  const result = await db
    .select(tt)
    .from(apiKeys)
    .where(and(scopeFilter(workspaceId), eq(apiKeys.token, token)))
    .limit(1)

  if (!result[0]) {
    throw new NotFoundError('API key not found')
  }

  return result[0] as ApiKey
})
