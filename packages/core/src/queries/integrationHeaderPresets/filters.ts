import { eq } from 'drizzle-orm'

import { integrationHeaderPresets } from '../../schema/models/integrationHeaderPresets'

export const tenancyFilter = (workspaceId: number) =>
  eq(integrationHeaderPresets.workspaceId, workspaceId)
