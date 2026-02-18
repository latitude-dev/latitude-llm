import { Context } from 'hono'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { BadRequestError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { getVersionRouteConfig } from './getCommit.route'

// @ts-expect-error: Types are not working as expected
export const getVersionHandler: AppRouteHandler<
  typeof getVersionRouteConfig
> = async (c: Context) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.param()
  if (!versionUuid) {
    throw new BadRequestError('Commit uuid is required')
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitByUuid({
      projectId: Number(projectId),
      uuid: versionUuid,
    })
    .then((r) => r.unwrap())

  return c.json(commit, 200)
}
