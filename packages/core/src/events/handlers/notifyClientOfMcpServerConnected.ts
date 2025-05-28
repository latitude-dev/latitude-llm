import { unsafelyFindWorkspace } from '../../data-access'
import { WebsocketClient } from '../../websockets/workers'
import { McpServerConnectedEvent } from '../events'
import { NotFoundError } from './../../lib/errors'

export const notifyClientOfMcpServerConnected = async ({
  data: event,
}: {
  data: McpServerConnectedEvent
}) => {
  const { workspaceId, mcpServerId } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  await WebsocketClient.sendEvent('mcpServerConnected', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      mcpServerId: mcpServerId,
    },
  })
}
