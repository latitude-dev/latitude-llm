import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { ProjectsRepository, RunsRepository } from '../../repositories'
import { WebsocketClient } from '../../websockets/workers'
import { RunStatusEvent } from '../events'

export const notifyClientOfRunStatus = async ({
  data: event,
}: {
  data: RunStatusEvent
}) => {
  const { workspaceId, projectId, runUuid } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const projectsRepository = new ProjectsRepository(workspaceId)
  const project = await projectsRepository
    .getProjectById(projectId)
    .then((r) => r.unwrap())

  const runsRepository = new RunsRepository(workspace.id, project.id)
  const run = await runsRepository.get({ runUuid }).then((r) => r.unwrap())

  await WebsocketClient.sendEvent('runStatus', {
    workspaceId: workspace.id,
    data: { event: event.type, workspaceId, projectId, run },
  })
}
