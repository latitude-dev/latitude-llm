import { eq } from 'drizzle-orm'

import { ProviderApiKey } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { providerApiKeys } from '../../schema'

export function destroyProviderApiKey(
  providerApiKey: ProviderApiKey,
  db = database,
) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .delete(providerApiKeys)
      .where(eq(providerApiKeys.id, providerApiKey.id))
      .returning()
    const deleted = result[0]

    return Result.ok(deleted)
  }, db)
}
