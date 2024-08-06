import { ProviderApiKey } from '$core/browser'
import { database } from '$core/client'
import { Result, Transaction } from '$core/lib'
import { providerApiKeys } from '$core/schema'
import { eq } from 'drizzle-orm'

export async function updateProviderApiKey(
  {
    providerApiKey,
    lastUsedAt,
  }: {
    providerApiKey: ProviderApiKey
    lastUsedAt: Date
  },
  db = database,
) {
  return Transaction.call<ProviderApiKey>(async (tx) => {
    const result = await tx
      .update(providerApiKeys)
      .set({ lastUsedAt })
      .where(eq(providerApiKeys.id, providerApiKey.id))
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
