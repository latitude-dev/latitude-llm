import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { serializeProviderApiKey } from '../../services/providerApiKeys/helpers/serializeProviderApiKey'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const findFirstProviderApiKey = scopedQuery(
  async function findFirstProviderApiKey(
    { workspaceId }: { workspaceId: number },
    db,
  ): Promise<ProviderApiKey | undefined> {
    const result = await db
      .select(tt)
      .from(providerApiKeys)
      .where(scopeFilter(workspaceId))
      .limit(1)

    const row = result[0]
    return row
      ? serializeProviderApiKey(row as ProviderApiKey)
      : undefined
  },
)
