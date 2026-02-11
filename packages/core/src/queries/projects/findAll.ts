import { type Project } from '../../schema/models/types/Project'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findAllProjects = scopedQuery(async function findAllProjects(
  { workspaceId }: { workspaceId: number },
  db,
): Promise<Project[]> {
  const result = await db
    .select(tt)
    .from(projects)
    .where(tenancyFilter(workspaceId))
  return result as Project[]
})
