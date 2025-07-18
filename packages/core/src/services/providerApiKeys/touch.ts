import { eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { providerApiKeys } from '../../schema'

export function touchProviderApiKey(
  id: number,
  transaction = new Transaction(),
) {
  return transaction.call(async (tx) => {
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
  })
}
