import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { WebsocketClient } from '../../websockets/workers'
import { DocumentTriggerCreatedEvent } from '../events'

export const notifyClientOfDocumentTriggerCreated = async ({
  data: event,
}: {
  data: DocumentTriggerCreatedEvent
}) => {
  const { workspaceId, documentTrigger } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  await WebsocketClient.sendEvent('triggerCreated', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      trigger: documentTrigger,
    },
  })
}
