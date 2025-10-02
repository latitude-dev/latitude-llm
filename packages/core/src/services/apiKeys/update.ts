import { eq } from 'drizzle-orm'

import { ApiKey } from '../../schema/types'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema/models/apiKeys'

export async function updateApiKey(
  apiKey: ApiKey,
  { name }: { name: string },
  transaction = new Transaction(),
) {
  return transaction.call(async (trx) => {
    const result = await trx
      .update(apiKeys)
      .set({ name })
      .where(eq(apiKeys.id, apiKey.id))
      .returning()

    return Result.ok(result[0]!)
  })
}
