import { unsafelyFindProject, unsafelyFindWorkspace } from '../../data-access'
import { NotFoundError } from '../../lib'
import { WebsocketClient } from '../../websockets/workers'
import { BulkCreateTracesAndSpansEvent } from '../events'

export const notifyClientOfBulkCreateTracesAndSpans = async ({
  data: event,
}: {
  data: BulkCreateTracesAndSpansEvent
}) => {
  const { traces, spans, projectId } = event.data
  const project = await unsafelyFindProject(projectId)
  if (!project) throw new NotFoundError('Project not found')

  const workspace = await unsafelyFindWorkspace(project.workspaceId)
  if (!workspace) throw new NotFoundError('Workspace not found')

  const websockets = await WebsocketClient.getSocket()

  websockets.emit('tracesAndSpansCreated', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      projectId: project.id,
      traces,
      spans,
    },
  })
}
