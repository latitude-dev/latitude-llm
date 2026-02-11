import { findProjectById } from '@latitude-data/core/queries/projects/findById'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { CreateCommitRoute } from './createCommit.route'
import { createCommit } from '@latitude-data/core/services/commits/create'
import { findFirstUserInWorkspace } from '@latitude-data/core/queries/users/findFirstInWorkspace'

// @ts-expect-error: broken types
export const createCommitHandler: AppRouteHandler<CreateCommitRoute> = async (
  c,
) => {
  const workspace = c.get('workspace')
  const { projectId } = c.req.valid('param')
  if (!projectId) {
    throw new BadRequestError('Project id is required')
  }

  const { name } = c.req.valid('json')
  const project = await findProjectById({
    workspaceId: workspace.id,
    id: Number(projectId),
  })
  if (!project) {
    throw new NotFoundError('Project not found')
  }

  const user = await findFirstUserInWorkspace({ workspaceId: workspace.id })
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
