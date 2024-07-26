import { database } from '$core/client'
import { NotFoundError, Result } from '$core/lib'
import { apiKeys } from '$core/schema'
import { eq } from 'drizzle-orm'

export async function unsafelyGetApiKey(
  { token }: { token: string },
  db = database,
) {
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.token, token),
  })
  if (!apiKey) return Result.error(new NotFoundError('API key not found'))

  return Result.ok(apiKey)
}
