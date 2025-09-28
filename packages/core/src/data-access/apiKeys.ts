import { apiKeys } from '../schema/models/apiKeys'
import { eq } from 'drizzle-orm'

import { ApiKey } from '../schema/types'
import { database } from '../client'
import { NotFoundError } from '../lib/errors'
import { Result, TypedResult } from '../lib/Result'

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

export async function unsafelyGetFirstApiKeyByWorkspaceId({
  workspaceId,
}: {
  workspaceId: number
}) {
  const apiKey = await database.query.apiKeys.findFirst({
    where: eq(apiKeys.workspaceId, workspaceId),
  })

  if (!apiKey) return Result.error(new NotFoundError('API key not found'))

  return Result.ok(apiKey)
}
