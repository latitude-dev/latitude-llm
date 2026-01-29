import { eq } from 'drizzle-orm'

import { type ApiKey } from '../../schema/models/types/ApiKey'
import { BadRequestError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { apiKeys } from '../../schema/models/apiKeys'
import { MAX_API_KEY_NAME_LENGTH } from './create'

export async function updateApiKey(
  apiKey: ApiKey,
  { name }: { name: string },
  transaction = new Transaction(),
) {
  if (name.length > MAX_API_KEY_NAME_LENGTH) {
    return Result.error(
      new BadRequestError(
        `API key name must be ${MAX_API_KEY_NAME_LENGTH} characters or less`,
      ),
    )
  }

  return transaction.call(async (trx) => {
    const result = await trx
      .update(apiKeys)
      .set({ name })
      .where(eq(apiKeys.id, apiKey.id))
      .returning()

    return Result.ok(result[0]!)
  })
}
