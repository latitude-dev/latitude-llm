import { eq } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { type ApiKey } from '../../schema/models/types/ApiKey'
import { apiKeys } from '../../schema/models/apiKeys'
import { unscopedQuery } from '../scope'
import { tt } from './columns'

export const unsafelyGetApiKeyByToken = unscopedQuery(
  async function unsafelyGetApiKeyByToken(
    { token }: { token: string },
    db,
  ): Promise<ApiKey> {
    const result = await db
      .select(tt)
      .from(apiKeys)
      .where(eq(apiKeys.token, token))
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError('API key not found')
    }

    return result[0] as ApiKey
  },
)
