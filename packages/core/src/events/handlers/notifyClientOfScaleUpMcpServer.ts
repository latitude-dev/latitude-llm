import { unsafelyFindWorkspace } from '../../data-access'
import { NotFoundError } from '../../lib/errors'
import { WebsocketClient } from '../../websockets/workers'
import type { ScaleMcpServerEvent } from '../events'

export const notifyClientOfScaleUpMcpServer = async ({
  data: event,
}: {
  data: ScaleMcpServerEvent
}) => {
  const { workspaceId, mcpServerId, replicas } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  await WebsocketClient.sendEvent('mcpServerScaleEvent', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      mcpServerId: mcpServerId,
      replicas: replicas,
    },
  })
}
