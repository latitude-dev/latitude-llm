import { CommitsRepository } from '@latitude-data/core/repositories'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { PublishCommitRoute } from './publishCommit.route'
import { updateAndMergeCommit } from '@latitude-data/core/services/commits/updateAndMerge'
import { findFirstUserInWorkspace } from '@latitude-data/core/data-access/users'
import { publisher } from '@latitude-data/core/events/publisher'

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

  const merged = await updateAndMergeCommit({
    commit,
    workspace,
    data: {
      title,
      description,
    },
  }).then((r) => r.unwrap())

  const user = await findFirstUserInWorkspace(workspace)
  if (!user) {
    throw new NotFoundError('User not found in this workspace')
  }

  publisher.publishLater({
    type: 'commitPublished',
    data: {
      commit: merged,
      userEmail: user.email,
      workspaceId: workspace.id,
    },
  })

  return c.json(merged, 200)
}
