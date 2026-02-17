import { and, eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { serializeProviderApiKey } from '../../services/providerApiKeys/helpers/serializeProviderApiKey'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { scopeFilter } from './filters'

export const findProviderApiKeyById = scopedQuery(
  async function findProviderApiKeyById(
    {
      workspaceId,
      id,
    }: { workspaceId: number; id: number },
    db,
  ): Promise<ProviderApiKey> {
    const result = await db
      .select(tt)
      .from(providerApiKeys)
      .where(and(scopeFilter(workspaceId), eq(providerApiKeys.id, id)))
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError(
        `Record with id ${id} not found in provider_api_keys`,
      )
    }

    return serializeProviderApiKey(result[0] as ProviderApiKey)
  },
)
