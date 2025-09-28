import { eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction, { PromisedResult } from '../../lib/Transaction'
import { integrations } from '../../schema/models/integrations'

export function touchIntegration(
  id: number,
  transaction = new Transaction(),
): PromisedResult<undefined, Error> {
  return transaction.call(async (tx) => {
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
  })
}
