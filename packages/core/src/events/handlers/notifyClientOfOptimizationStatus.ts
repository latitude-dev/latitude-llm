import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { OptimizationsRepository } from '../../repositories'
import { WebsocketClient } from '../../websockets/workers'
import { OptimizationStatusEvent } from '../events'

export const notifyClientOfOptimizationStatus = async ({
  data: event,
}: {
  data: OptimizationStatusEvent
}) => {
  const { workspaceId, optimizationId } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) return

  const repository = new OptimizationsRepository(workspace.id)
  const optimization = await repository
    .findWithDetails(optimizationId)
    .then((r) => r.value)
  if (!optimization) return

  await WebsocketClient.sendEvent('optimizationStatus', {
    workspaceId,
    data: { workspaceId, optimization },
  })
}
