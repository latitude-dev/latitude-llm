import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { NotFoundError, Result, Transaction } from '../../lib'
import { integrations } from '../../schema'

export function touchIntegration(id: number, db = database) {
  return Transaction.call(async (tx) => {
    const result = await tx
      .update(integrations)
      .set({
        lastUsedAt: new Date(),
      })
      .where(eq(integrations.id, id))
      .returning()

    if (!result.length) {
      return Result.error(new NotFoundError('Integration not found'))
    }
    return Result.ok(result[0]!)
  }, db)
}
