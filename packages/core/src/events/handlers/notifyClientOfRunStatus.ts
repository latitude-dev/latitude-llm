import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { ProjectsRepository } from '../../repositories'
import { getRun } from '../../services/runs/get'
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

  const run = await getRun({
    workspaceId: workspace.id,
    projectId: project.id,
    runUuid,
  }).then((r) => r.unwrap())

  await WebsocketClient.sendEvent('runStatus', {
    workspaceId: workspace.id,
    data: { event: event.type, workspaceId, projectId, run },
  })
}
