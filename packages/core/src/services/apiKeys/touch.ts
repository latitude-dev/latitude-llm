import { database } from '$core/client'
import { NotFoundError, Result, Transaction } from '$core/lib'
import { apiKeys } from '$core/schema'
import { eq } from 'drizzle-orm'

export function touchApiKey(id: number, db = database) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .update(apiKeys)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(apiKeys.id, id))
      .returning()

    if (!result.length) {
      return Result.error(new NotFoundError('ApiKey not found'))
    }
    return Result.ok(result[0]!)
  }, db)
}
