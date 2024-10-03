import { eq } from 'drizzle-orm'

import { ApiKey } from '../browser'
import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'
import { apiKeys } from '../schema'

export async function unsafelyGetApiKeyByToken(
  { token }: { token: string },
  db = database,
): Promise<TypedResult<ApiKey, Error>> {
  console.log('---------------------\n')
  console.log("TOKEN", token)
  console.log('---------------------\n')

  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.token, token),
  })

  if (!apiKey) return Result.error(new NotFoundError('API key not found'))

  return Result.ok(apiKey)
}
