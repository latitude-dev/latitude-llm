import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { serializeProviderApiKey } from '../../services/providerApiKeys/helpers/serializeProviderApiKey'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const findProviderApiKeyByName = scopedQuery(
  async function findProviderApiKeyByName(
    {
      workspaceId,
      name,
    }: { workspaceId: number; name: string },
    db,
  ): Promise<ProviderApiKey> {
    const result = await db
      .select(tt)
      .from(providerApiKeys)
      .where(
        and(scopeFilter(workspaceId), eq(providerApiKeys.name, name)),
      )
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError(
        `ProviderApiKey not found by name: "${name}"`,
      )
    }

    return serializeProviderApiKey(result[0] as ProviderApiKey)
  },
)
