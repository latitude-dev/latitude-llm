import { eq } from 'drizzle-orm'

import { ApiKey } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { apiKeys } from '../../schema'

export async function destroyApiKey(apiKey: ApiKey, db = database) {
  return Transaction.call(async (trx) => {
    await trx.delete(apiKeys).where(eq(apiKeys.id, apiKey.id))

    return Result.ok(apiKey)
  }, db)
}
