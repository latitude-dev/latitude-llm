import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'

import { ProviderApiKey } from '../../browser'
import { publisher } from '../../events/publisher'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { providerApiKeys, workspaces } from '../../schema'

export async function destroyProviderApiKey(
  providerApiKey: ProviderApiKey,
  transaction = new Transaction(),
) {
  if (providerApiKey.token === env.DEFAULT_PROVIDER_API_KEY) {
    return Result.error(
      new BadRequestError('Cannot delete the default provider API key'),
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

      return Result.ok(deleted)
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
