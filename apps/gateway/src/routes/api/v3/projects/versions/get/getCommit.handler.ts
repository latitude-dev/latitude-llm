import { Context } from 'hono'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { BadRequestError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { getVersionRoute } from './getCommit.route'

// @ts-expect-error: broken types
export const getVersionHandler: AppRouteHandler<
  typeof getVersionRoute
> = async (c: Context) => {
  const workspace = c.get('workspace')
  const { versionUuid } = c.req.param()
  if (!versionUuid) {
    throw new BadRequestError('Commit uuid is required')
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitByUuid({
      uuid: versionUuid,
    })
    .then((r) => r.unwrap())

  return c.json(commit, 200)
}
