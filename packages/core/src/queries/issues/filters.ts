import { eq } from 'drizzle-orm'

import { issues } from '../../schema/models/issues'

export const tenancyFilter = (workspaceId: number) =>
  eq(issues.workspaceId, workspaceId)
