import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { integrations } from '../../schema'
import { NotFoundError } from './../../lib/errors'
import Transaction, { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'

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
      return Result.error(new NotFoundError('IntegrationDto not found'))
    }
    return Result.nil()
  }, db)
}
