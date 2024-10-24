import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'

import { ProviderApiKey } from '../../browser'
import { database } from '../../client'
import { BadRequestError, Result, Transaction } from '../../lib'
import { providerApiKeys } from '../../schema'

export async function destroyProviderApiKey(
  providerApiKey: ProviderApiKey,
  db = database,
) {
  if (providerApiKey.token === env.DEFAULT_PROVIDER_API_KEY) {
    return Result.error(
      new BadRequestError('Cannot delete the default provider API key'),
    )
  }

  return Transaction.call(async (tx) => {
    const result = await tx
      .update(providerApiKeys)
      .set({ deletedAt: new Date(), token: '<removed>' })
      .where(eq(providerApiKeys.id, providerApiKey.id))
      .returning()
    const deleted = result[0]!

    return Result.ok(deleted)
  }, db)
}
