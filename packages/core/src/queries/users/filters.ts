import { eq } from 'drizzle-orm'

import { memberships } from '../../schema/models/memberships'

export const tenancyFilter = (workspaceId: number) =>
  eq(memberships.workspaceId, workspaceId)
