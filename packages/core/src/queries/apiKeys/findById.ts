import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { type ApiKey } from '../../schema/models/types/ApiKey'
import { apiKeys } from '../../schema/models/apiKeys'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const findApiKeyById = scopedQuery(
  async function findApiKeyById(
    { workspaceId, id }: { workspaceId: number; id: number },
    db,
  ): Promise<ApiKey> {
    const result = await db
      .select(tt)
      .from(apiKeys)
      .where(and(scopeFilter(workspaceId), eq(apiKeys.id, id)))
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError(`API key with id ${id} not found`)
    }

    return result[0] as ApiKey
  },
)
