import { unsafelyFindWorkspace } from '../../data-access'
import { NotFoundError } from '../../lib'
import { WebsocketClient } from '../../websockets/workers'
import { McpServerConnectedEvent } from '../events'

export const notifyClientOfMcpServerConnected = async ({
  data: event,
}: {
  data: McpServerConnectedEvent
}) => {
  const { workspaceId, mcpServerId } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const websockets = await WebsocketClient.getSocket()
  websockets.emit('mcpServerConnected', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      mcpServerId: mcpServerId,
    },
  })
}
