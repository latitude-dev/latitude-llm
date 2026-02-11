import { type Project } from '../../schema/models/types/Project'
import { Result, TypedResult } from '../../lib/Result'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

export const findAllProjects = scopedQuery(async function findAllProjects(
  { workspaceId }: { workspaceId: number },
  db,
): Promise<TypedResult<Project[]>> {
  const result = await db
    .select(tt)
    .from(projects)
    .where(tenancyFilter(workspaceId))
  return Result.ok(result as Project[])
})
