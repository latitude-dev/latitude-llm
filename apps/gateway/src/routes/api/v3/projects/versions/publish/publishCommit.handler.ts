import { CommitsRepository } from '@latitude-data/core/repositories'
import { BadRequestError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { PublishCommitRoute } from './publishCommit.route'
import { updateAndMergeCommit } from '@latitude-data/core/services/commits/updateAndMerge'

// @ts-expect-error: broken types
export const publishCommitHandler: AppRouteHandler<PublishCommitRoute> = async (
  c,
) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.valid('param')
  if (!projectId || !versionUuid) {
    throw new BadRequestError('Project id and version uuid are required')
  }

  const { title, description } = c.req.valid('json')
  const commitsRepo = new CommitsRepository(workspace.id)
  const commit = await commitsRepo
    .getCommitByUuid({
      projectId: Number(projectId),
      uuid: versionUuid,
    })
    .then((r) => r.unwrap())

  const data: { title?: string; description?: string } = {}
  if (title !== undefined) data.title = title
  if (description !== undefined) data.description = description

  const merged = await updateAndMergeCommit({
    commit,
    workspace,
    data,
  }).then((r) => r.unwrap())

  return c.json(merged, 200)
}
