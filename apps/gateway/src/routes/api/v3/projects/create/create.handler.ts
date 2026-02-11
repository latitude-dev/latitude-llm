import { createProject } from '@latitude-data/core/services/projects/create'
import { findFirstUserInWorkspace } from '@latitude-data/core/queries/users/findFirstInWorkspace'
import { NotFoundError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { createRoute } from './create.route'

// @ts-expect-error: broken types
export const createHandler: AppRouteHandler<typeof createRoute> = async (c) => {
  const workspace = c.get('workspace')

  const { name } = c.req.valid('json')

  const user = await findFirstUserInWorkspace({ workspaceId: workspace.id })
  if (!user) {
    throw new NotFoundError('User not found in workspace')
  }

  const result = await createProject({
    name,
    workspace,
    user,
  }).then((r) => r.unwrap())

  return c.json({ project: result.project, version: result.commit }, 201)
}
