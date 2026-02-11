import { type Project } from '../../schema/models/types/Project'
import { NotFoundError } from '../../lib/errors'
import { Result, TypedResult } from '../../lib/Result'
import { type ProjectsScope } from './scope'

const NOT_FOUND_MSG = 'Project not found'

export async function findFirstProject(
  scope: ProjectsScope,
): Promise<TypedResult<Project>> {
  const result = await scope.base().limit(1)
  const project = result[0] as Project | undefined
  if (!project) return Result.error(new NotFoundError(NOT_FOUND_MSG))
  return Result.ok(project)
}
