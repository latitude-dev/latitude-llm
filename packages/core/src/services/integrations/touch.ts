import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { NotFoundError, PromisedResult, Result, Transaction } from '../../lib'
import { integrations } from '../../schema'

export function touchIntegration(
  id: number,
  db = database,
): PromisedResult<undefined, Error> {
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
    return Result.nil()
  }, db)
}
