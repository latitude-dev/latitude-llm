import { eq } from 'drizzle-orm'

import { type ApiKey } from '../../schema/models/types/ApiKey'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema/models/apiKeys'

export async function destroyApiKey(
  apiKey: ApiKey,
  transaction = new Transaction(),
) {
  return transaction.call(async (trx) => {
    await trx.delete(apiKeys).where(eq(apiKeys.id, apiKey.id))

    return Result.ok(apiKey)
  })
}
