import { Context } from 'hono'
import { BadRequestError, NotFoundError } from '@latitude-data/constants/errors'
import { AppRouteHandler } from '$/openApi/types'
import { pushCommitRoute } from './pushCommit.route'
import {
  CommitsRepository,
  ProjectsRepository,
} from '@latitude-data/core/repositories'
import { persistPushChanges } from '@latitude-data/core/services/commits/persistPushChanges'

export const pushCommitHandler: AppRouteHandler<
  typeof pushCommitRoute
> = async (c: Context) => {
  const workspace = c.get('workspace')
  const user = c.get('user')
  const { projectId, commitUuid } = c.req.param()
  const { changes } = await c.req.json()

  if (!commitUuid) {
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
    uuid: commitUuid,
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
    documents: changes,
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
