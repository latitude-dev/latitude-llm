import { Context } from 'hono'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { BadRequestError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { getAllVersionsRouteConfig } from './getAllVersions.route'

export const getAllVersionsHandler: AppRouteHandler<
  typeof getAllVersionsRouteConfig
> = async (c: Context) => {
  const workspace = c.get('workspace')
  const { projectId } = c.req.param()
  if (!projectId) {
    throw new BadRequestError('Project ID is required')
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const commits = await commitsRepository
    .filterByProject(Number(projectId))
    .then((r) => r.unwrap())

  return c.json(commits, 200)
}
