import { and, eq } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findProjectByName = scopedQuery(async function findProjectByName(
  { workspaceId, name }: { workspaceId: number; name: string },
  db,
): Promise<Project | undefined> {
  const result = await db
    .select(tt)
    .from(projects)
    .where(and(tenancyFilter(workspaceId), eq(projects.name, name)))
    .limit(1)
  return result[0] as Project | undefined
})
