import { type Project } from '../../schema/models/types/Project'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findFirstProject = scopedQuery(async function findFirstProject(
  { workspaceId }: { workspaceId: number },
  db,
): Promise<Project | undefined> {
  const result = await db
    .select(tt)
    .from(projects)
    .where(tenancyFilter(workspaceId))
    .limit(1)
  return result[0] as Project | undefined
})
