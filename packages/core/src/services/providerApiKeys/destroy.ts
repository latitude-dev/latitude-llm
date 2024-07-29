import { database } from '$core/client'
import { Result, Transaction } from '$core/lib'
import { ProviderApiKey, providerApiKeys } from '$core/schema'
import { eq } from 'drizzle-orm'

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
