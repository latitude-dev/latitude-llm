import { and, eq, isNull } from 'drizzle-orm'

import { NotFoundError } from '../../lib/errors'
import { type ApiKey } from '../../schema/models/types/ApiKey'
import { apiKeys } from '../../schema/models/apiKeys'
import { unscopedQuery } from '../scope'
import { tt } from './columns'

export const unsafelyGetFirstApiKeyByWorkspaceId = unscopedQuery(
  async function unsafelyGetFirstApiKeyByWorkspaceId(
    { workspaceId }: { workspaceId: number },
    db,
  ): Promise<ApiKey> {
    const result = await db
      .select(tt)
      .from(apiKeys)
      .where(
        and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.deletedAt)),
      )
      .limit(1)

    if (!result[0]) {
      throw new NotFoundError('API key not found')
    }

    return result[0] as ApiKey
  },
)
