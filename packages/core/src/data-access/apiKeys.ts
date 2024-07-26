import { database } from '$core/client'
import { NotFoundError, Result } from '$core/lib'
import { apiKeys } from '$core/schema'
import { eq } from 'drizzle-orm'

export async function unsafelyGetApiKey(
  { uuid }: { uuid: string },
  db = database,
) {
  const apiKey = await db.query.apiKeys.findFirst({
    where: eq(apiKeys.uuid, uuid),
  })
  if (!apiKey) return Result.error(new NotFoundError('API key not found'))

  return Result.ok(apiKey)
}
