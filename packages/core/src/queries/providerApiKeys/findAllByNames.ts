import { and, inArray } from 'drizzle-orm'

import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { serializeProviderApiKeys } from '../../services/providerApiKeys/helpers/serializeProviderApiKey'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const findAllProviderApiKeysByNames = scopedQuery(
  async function findAllProviderApiKeysByNames(
    {
      workspaceId,
      names,
    }: { workspaceId: number; names: string[] },
    db,
  ): Promise<ProviderApiKey[]> {
    if (names.length === 0) {
      return []
    }

    const result = await db
      .select(tt)
      .from(providerApiKeys)
      .where(
        and(
          scopeFilter(workspaceId),
          inArray(providerApiKeys.name, names),
        ),
      )

    return serializeProviderApiKeys(result as ProviderApiKey[])
  },
)
