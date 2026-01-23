import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'

import { type ProviderApiKey } from '../../schema/models/types/ProviderApiKey'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { providerApiKeys } from '../../schema/models/providerApiKeys'
import { workspaces } from '../../schema/models/workspaces'
import { serializeProviderApiKey } from './helpers/serializeProviderApiKey'

export async function destroyProviderApiKey(
  providerApiKey: ProviderApiKey,
  transaction = new Transaction(),
) {
  if (providerApiKey.token === env.DEFAULT_PROVIDER_API_KEY) {
    return Result.error(
      new BadRequestError('Cannot delete the Latitude provider API key'),
    )
  }

  return transaction.call(
    async (tx) => {
      await tx
        .update(workspaces)
        .set({ defaultProviderId: null })
        .where(eq(workspaces.defaultProviderId, providerApiKey.id))

      const result = await tx
        .update(providerApiKeys)
        .set({ deletedAt: new Date(), token: `<removed-${providerApiKey.id}>` })
        .where(eq(providerApiKeys.id, providerApiKey.id))
        .returning()
      const deleted = result[0]!

      return Result.ok(serializeProviderApiKey(deleted))
    },
    (apikey) => {
      publisher.publishLater({
        type: 'providerApiKeyDestroyed',
        data: {
          providerApiKey: apikey,
          workspaceId: providerApiKey.workspaceId,
        },
      })
    },
  )
}
