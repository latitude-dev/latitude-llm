import { and, eq, isNull } from 'drizzle-orm'

import { apiKeys } from '../../schema/models/apiKeys'

export const tenancyFilter = (workspaceId: number) =>
  eq(apiKeys.workspaceId, workspaceId)

export const scopeFilter = (workspaceId: number) =>
  and(eq(apiKeys.workspaceId, workspaceId), isNull(apiKeys.deletedAt))
