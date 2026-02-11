import { desc, isNull } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { Result, TypedResult } from '../../lib/Result'
import { projects } from '../../schema/models/projects'
import { type ProjectsScope } from './scope'

export async function findAllActiveProjects(
  scope: ProjectsScope,
): Promise<TypedResult<Project[]>> {
  const result = await scope
    .where(isNull(projects.deletedAt))
    .orderBy(desc(projects.lastEditedAt), desc(projects.id))

  return Result.ok(result as Project[])
}
