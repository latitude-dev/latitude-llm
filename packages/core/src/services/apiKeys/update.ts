import { eq } from 'drizzle-orm'

import { ApiKey } from '../../browser'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import Transaction from './../../lib/Transaction'
import { apiKeys } from '../../schema'

export async function updateApiKey(
  apiKey: ApiKey,
  { name }: { name: string },
  db = database,
) {
  return Transaction.call(async (trx) => {
    const result = await trx
      .update(apiKeys)
      .set({ name })
      .where(eq(apiKeys.id, apiKey.id))
      .returning()

    return Result.ok(result[0]!)
  }, db)
}
