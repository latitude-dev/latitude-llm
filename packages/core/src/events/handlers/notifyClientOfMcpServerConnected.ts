import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
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

  await WebsocketClient.sendEvent('mcpServerConnected', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      mcpServerId: mcpServerId,
    },
  })
}
