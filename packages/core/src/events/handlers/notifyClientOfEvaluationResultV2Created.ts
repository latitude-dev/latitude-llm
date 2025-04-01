import { unsafelyFindWorkspace } from '../../data-access'
import { NotFoundError } from '../../lib'
import { WebsocketClient } from '../../websockets/workers'
import { EvaluationResultV2CreatedEvent } from '../events'

export const notifyClientOfEvaluationResultV2Created = async ({
  data: event,
}: {
  data: EvaluationResultV2CreatedEvent
}) => {
  const { workspaceId, ...rest } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const websockets = await WebsocketClient.getSocket()
  websockets.emit('evaluationResultV2Created', {
    workspaceId: workspace.id,
    data: { workspaceId: workspace.id, ...rest },
  })
}
