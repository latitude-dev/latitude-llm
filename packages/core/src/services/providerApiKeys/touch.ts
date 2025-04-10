import { eq } from 'drizzle-orm'

import { database } from '../../client'
import { providerApiKeys } from '../../schema'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

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
