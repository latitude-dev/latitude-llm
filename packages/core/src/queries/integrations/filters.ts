import { eq } from 'drizzle-orm'

import { integrations } from '../../schema/models/integrations'

export const tenancyFilter = (workspaceId: number) =>
  eq(integrations.workspaceId, workspaceId)
