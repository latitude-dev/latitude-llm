import { database } from '$core/client'
import { NotFoundError, Result, TypedResult } from '$core/lib'
import { ApiKey, apiKeys } from '$core/schema'
import { eq } from 'drizzle-orm'

export async function unsafelyGetApiKeyByToken(
  { token }: { token: string },
  db = database,
): Promise<TypedResult<ApiKey, Error>> {
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.token, token),
  })

  if (!apiKey) return Result.error(new NotFoundError('API key not found'))

  return Result.ok(apiKey)
}
