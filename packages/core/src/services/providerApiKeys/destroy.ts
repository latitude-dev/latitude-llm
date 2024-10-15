import { env } from '@latitude-data/env'
import { eq } from 'drizzle-orm'
import { DatabaseError } from 'pg'

import { ProviderApiKey } from '../../browser'
import { database } from '../../client'
import {
  BadRequestError,
  databaseErrorCodes,
  Result,
  Transaction,
} from '../../lib'
import { providerApiKeys } from '../../schema'

export async function destroyProviderApiKey(
  providerApiKey: ProviderApiKey,
  db = database,
) {
  if (providerApiKey.token === env.DEFAULT_PROVIDER_API_KEY) {
    return Result.error(
      new BadRequestError('Cannot delete the default provider API key'),
    )
  }

  return Transaction.call(async (tx) => {
    try {
      const result = await tx
        .delete(providerApiKeys)
        .where(eq(providerApiKeys.id, providerApiKey.id))
        .returning()
      const deleted = result[0]

      return Result.ok(deleted)
    } catch (error) {
      if (
        error instanceof DatabaseError &&
        error.code === databaseErrorCodes.foreignKeyViolation
      ) {
        return Result.error(
          new BadRequestError(
            'Cannot delete provider API key because it is still in use.',
          ),
        )
      }

      throw error
    }
  }, db)
}
