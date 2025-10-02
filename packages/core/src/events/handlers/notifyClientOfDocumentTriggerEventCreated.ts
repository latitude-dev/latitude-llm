import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { WebsocketClient } from '../../websockets/workers'
import { DocumentTriggerEventCreatedEvent } from '../events'

export const notifyClientOfDocumentTriggerEventCreated = async ({
  data: event,
}: {
  data: DocumentTriggerEventCreatedEvent
}) => {
  const { workspaceId, commit, documentTriggerEvent } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  await WebsocketClient.sendEvent('triggerEventCreated', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      commit,
      triggerEvent: documentTriggerEvent,
    },
  })
}
