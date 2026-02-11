import { and, eq } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findProjectById = scopedQuery(async function findProjectById(
  { workspaceId, id }: { workspaceId: number; id: number },
  db,
): Promise<Project | undefined> {
  const result = await db
    .select(tt)
    .from(projects)
    .where(and(tenancyFilter(workspaceId), eq(projects.id, id)))
    .limit(1)
  return result[0] as Project | undefined
})
