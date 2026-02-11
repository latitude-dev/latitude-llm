import { eq } from 'drizzle-orm'

import { projects } from '../../schema/models/projects'

export const tenancyFilter = (workspaceId: number) =>
  eq(projects.workspaceId, workspaceId)
