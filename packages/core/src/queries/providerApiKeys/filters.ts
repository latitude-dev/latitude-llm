import { and, eq, isNull } from 'drizzle-orm'

import { providerApiKeys } from '../../schema/models/providerApiKeys'

export const tenancyFilter = (workspaceId: number) =>
  eq(providerApiKeys.workspaceId, workspaceId)

export const scopeFilter = (workspaceId: number) =>
  and(
    isNull(providerApiKeys.deletedAt),
    eq(providerApiKeys.workspaceId, workspaceId),
  )
