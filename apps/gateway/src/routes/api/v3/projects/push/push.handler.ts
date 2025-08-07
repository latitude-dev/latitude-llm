import type { Context } from 'hono'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import type { AppRouteHandler } from '$/openApi/types'
import { CommitsRepository, ProjectsRepository } from '@latitude-data/core/repositories'
import { persistPushChanges } from '@latitude-data/core/services/commits/persistPushChanges'
import type { pushRoute } from './push.route'

// @ts-expect-error - TODO: Fix this
export const pushHandler: AppRouteHandler<typeof pushRoute> = async (c: Context) => {
  const workspace = c.get('workspace')
  const { projectId, versionUuid } = c.req.param()
  const { changes } = await c.req.json()

  if (!versionUuid) {
    throw new BadRequestError('Commit uuid is required')
  }
  if (!projectId) {
    throw new BadRequestError('Project id is required')
  }
  if (!changes || !Array.isArray(changes)) {
    throw new BadRequestError('Changes array is required')
  }

  // Verify project exists and belongs to workspace
  const projectsRepository = new ProjectsRepository(workspace.id)
  const projectResult = await projectsRepository.find(Number(projectId))
  if (projectResult.error) {
    throw new NotFoundError('Project not found')
  }
  const project = projectResult.value

  // Get the commit
  const commitsRepository = new CommitsRepository(workspace.id)
  const commitResult = await commitsRepository.getCommitByUuid({
    uuid: versionUuid,
    projectId: project.id,
  })
  if (commitResult.error) {
    throw new NotFoundError('Commit not found')
  }
  const commit = commitResult.value

  // Persist the push changes
  const result = await persistPushChanges({
    commit,
    workspace,
    changes,
  })

  if (result.error) {
    throw result.error
  }

  return c.json(
    {
      commitUuid: commit.uuid,
    },
    200,
  )
}
