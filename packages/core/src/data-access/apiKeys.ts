import { apiKeys } from '../schema/models/apiKeys'
import { eq } from 'drizzle-orm'

import { type ApiKey } from '../schema/models/types/ApiKey'
import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'

export async function unsafelyGetApiKeyByToken(
  { token }: { token: string },
  db = database,
): Promise<TypedResult<ApiKey, Error>> {
  const apiKey = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.token, token))
    .limit(1)
    .then((rows) => rows[0])

  if (!apiKey) return Result.error(new NotFoundError('API key not found'))

  return Result.ok(apiKey)
}

export async function unsafelyGetFirstApiKeyByWorkspaceId(
  { workspaceId }: { workspaceId: number },
  db = database,
) {
  const apiKey = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.workspaceId, workspaceId))
    .limit(1)
    .then((rows) => rows[0])

  if (!apiKey) return Result.error(new NotFoundError('API key not found'))

  return Result.ok(apiKey)
}
