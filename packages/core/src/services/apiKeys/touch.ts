import { eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema/models/apiKeys'

export function touchApiKey(id: number, transaction = new Transaction()) {
  return transaction.call(async (tx) => {
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
  })
}
