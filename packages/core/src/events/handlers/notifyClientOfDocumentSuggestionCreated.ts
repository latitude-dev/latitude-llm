import { unsafelyFindWorkspace } from '../../data-access'
import { WebsocketClient } from '../../websockets/workers'
import { DocumentSuggestionCreatedEvent } from '../events'
import { NotFoundError } from './../../lib/errors'

export const notifyClientOfDocumentSuggestionCreated = async ({
  data: event,
}: {
  data: DocumentSuggestionCreatedEvent
}) => {
  const { workspaceId, ...rest } = event.data

  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const websockets = await WebsocketClient.getSocket()
  websockets.emit('documentSuggestionCreated', {
    workspaceId: workspace.id,
    data: { workspaceId: workspace.id, ...rest },
  })
}
