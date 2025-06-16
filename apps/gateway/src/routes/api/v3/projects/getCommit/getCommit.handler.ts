import { Context } from 'hono'
import { CommitsRepository } from '@latitude-data/core/repositories'
import { BadRequestError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { getCommitRoute } from './getCommit.route'

// @ts-expect-error: broken types
export const getCommitHandler: AppRouteHandler<typeof getCommitRoute> = async (
  c: Context,
) => {
  const workspace = c.get('workspace')
  const { projectId, commitUuid } = c.req.param()
  if (!commitUuid) {
    throw new BadRequestError('Commit uuid is required')
  }
  if (!projectId) {
    throw new BadRequestError('Project id is required')
  }

  const commitsRepository = new CommitsRepository(workspace.id)
  const commit = await commitsRepository
    .getCommitByUuid({
      uuid: commitUuid,
      projectId: Number(projectId),
    })
    .then((r) => r.unwrap())

  return c.json(commit, 200)
}
