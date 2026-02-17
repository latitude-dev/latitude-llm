import { and, inArray, SQL } from 'drizzle-orm'

import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { serializeProviderApiKeys } from '../../services/providerApiKeys/helpers/serializeProviderApiKey'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export type FindManyProviderApiKeysOpts = {
  ordering?: SQL<unknown>[]
}

export const findManyProviderApiKeysByIds = scopedQuery(
  async function findManyProviderApiKeysByIds(
    {
      workspaceId,
      ids,
      ordering,
    }: {
      workspaceId: number
      ids: (string | number)[]
      ordering?: SQL<unknown>[]
    },
    db,
  ): Promise<ProviderApiKey[]> {
    if (ids.length === 0) {
      return []
    }

    let query = db
      .select(tt)
      .from(providerApiKeys)
      .where(
        and(
          scopeFilter(workspaceId),
          inArray(providerApiKeys.id, ids),
        ),
      )
      .limit(ids.length)

    if (ordering?.length) {
      query = query.orderBy(...ordering) as typeof query
    }

    const result = await query
    return serializeProviderApiKeys(result as ProviderApiKey[])
  },
)
