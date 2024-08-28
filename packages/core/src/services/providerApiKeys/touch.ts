import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { NotFoundError, Result, Transaction } from '../../lib'
import { providerApiKeys } from '../../schema'

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
