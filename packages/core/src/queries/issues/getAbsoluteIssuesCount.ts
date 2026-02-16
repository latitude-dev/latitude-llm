import { and, count, eq } from 'drizzle-orm'

import { issues } from '../../schema/models/issues'
import { type Project } from '../../schema/models/types/Project'
import { scopedQuery } from '../scope'
import { tenancyFilter } from './filters'

export const getAbsoluteIssuesCount = scopedQuery(
  async function getAbsoluteIssuesCount(
    {
      workspaceId,
      project,
    }: {
      workspaceId: number
      project: Project
    },
    db,
  ): Promise<number> {
    const result = await db
      .select({ count: count() })
      .from(issues)
      .where(and(tenancyFilter(workspaceId), eq(issues.projectId, project.id)))
    return result[0]?.count ?? 0
  },
)
