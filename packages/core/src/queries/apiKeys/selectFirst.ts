import { asc } from 'drizzle-orm'

import { type ApiKey } from '../../schema/models/types/ApiKey'
import { apiKeys } from '../../schema/models/apiKeys'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const selectFirstApiKey = scopedQuery(
  async function selectFirstApiKey(
    { workspaceId }: { workspaceId: number },
    db,
  ): Promise<ApiKey | undefined> {
    const result = await db
      .select(tt)
      .from(apiKeys)
      .where(scopeFilter(workspaceId))
      .orderBy(asc(apiKeys.createdAt))
      .limit(1)

    return result[0] as ApiKey | undefined
  },
)
