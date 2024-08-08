import { database } from '$core/client'
import { NotFoundError, Result, Transaction } from '$core/lib'
import { providerApiKeys } from '$core/schema'
import { eq } from 'drizzle-orm'

export function touchProviderApiKey(id: number, db = database) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .update(providerApiKeys)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(providerApiKeys.id, id))
      .returning()

    if (!result.length) {
      return Result.error(new NotFoundError('ProviderApiKey not found'))
    }
    return Result.ok(result[0]!)
  }, db)
}
