import { unsafelyFindWorkspace } from '../../data-access/workspaces'
import { NotFoundError } from '../../lib/errors'
import { WebsocketClient } from '../../websockets/workers'
import { DocumentTriggerDeletedEvent } from '../events'

export const notifyClientOfDocumentTriggerDeleted = async ({
  data: event,
}: {
  data: DocumentTriggerDeletedEvent
}) => {
  const { workspaceId, documentTrigger } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  await WebsocketClient.sendEvent('triggerDeleted', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      trigger: documentTrigger,
    },
  })
}
