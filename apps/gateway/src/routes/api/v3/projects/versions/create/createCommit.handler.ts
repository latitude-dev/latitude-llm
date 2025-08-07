import { ProjectsRepository } from '@latitude-data/core/repositories'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import type { AppRouteHandler } from '$/openApi/types'
import type { CreateCommitRoute } from './createCommit.route'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { findFirstUserInWorkspace } from '@latitude-data/core/data-access'

// @ts-expect-error: broken types
export const createCommitHandler: AppRouteHandler<CreateCommitRoute> = async (c) => {
  const workspace = c.get('workspace')
  const { projectId } = c.req.valid('param')
  if (!projectId) {
    throw new BadRequestError('Project id is required')
  }

  const { name } = c.req.valid('json')
  const projectsRepo = new ProjectsRepository(workspace.id)
  const project = await projectsRepo.getProjectById(Number(projectId)).then((r) => r.unwrap())

  const user = await findFirstUserInWorkspace(workspace)
  if (!user) {
    throw new NotFoundError('User not found in this workspace')
  }

  const commit = await createCommit({
    project,
    user,
    data: {
      title: name,
    },
  }).then((r) => r.unwrap())

  return c.json(commit, 200)
}
