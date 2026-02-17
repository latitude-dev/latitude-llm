import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { serializeProviderApiKeys } from '../../services/providerApiKeys/helpers/serializeProviderApiKey'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export type FindAllProviderApiKeysOpts = {
  limit?: number
  offset?: number
}

export const findAllProviderApiKeys = scopedQuery(
  async function findAllProviderApiKeys(
    {
      workspaceId,
      limit,
      offset,
    }: { workspaceId: number } & FindAllProviderApiKeysOpts,
    db,
  ): Promise<ProviderApiKey[]> {
    let query = db
      .select(tt)
      .from(providerApiKeys)
      .where(scopeFilter(workspaceId))

    if (limit !== undefined) {
      query = query.limit(limit) as typeof query
    }
    if (offset !== undefined) {
      query = query.offset(offset) as typeof query
    }

    const result = await query
    return serializeProviderApiKeys(result as ProviderApiKey[])
  },
)
