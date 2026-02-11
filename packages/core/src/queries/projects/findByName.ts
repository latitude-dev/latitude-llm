import { and, eq } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { projects } from '../../schema/models/projects'
import { scopedQuery } from '../scope'
import { tt } from './columns'
import { tenancyFilter } from './filters'

const NOT_FOUND_MSG = 'Project not found'

export const findProjectByName = scopedQuery(async function findProjectByName(
  { workspaceId, name }: { workspaceId: number; name: string },
  db,
): Promise<TypedResult<Project>> {
  const result = await db
    .select(tt)
    .from(projects)
    .where(and(tenancyFilter(workspaceId), eq(projects.name, name)))
    .limit(1)
  const project = result[0] as Project | undefined

  if (!project) return Result.error(new NotFoundError(NOT_FOUND_MSG))
  return Result.ok(project)
})
