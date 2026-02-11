import { eq } from 'drizzle-orm'

import { type Project } from '../../schema/models/types/Project'
import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { projects } from '../../schema/models/projects'
import { type ProjectsScope } from './scope'

const NOT_FOUND_MSG = 'Project not found'

export async function findProjectByName(
  scope: ProjectsScope,
  name: string,
): Promise<TypedResult<Project>> {
  const result = await scope.where(eq(projects.name, name)).limit(1)
  const project = result[0] as Project | undefined
  if (!project) return Result.error(new NotFoundError(NOT_FOUND_MSG))
  return Result.ok(project)
}
