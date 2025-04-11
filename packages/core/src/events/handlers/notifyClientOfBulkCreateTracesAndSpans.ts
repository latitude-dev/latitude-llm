import { unsafelyFindWorkspace } from '../../data-access'
import { WebsocketClient } from '../../websockets/workers'
import { BulkCreateTracesAndSpansEvent } from '../events'
import { NotFoundError } from './../../lib/errors'

export const notifyClientOfBulkCreateTracesAndSpans = async ({
  data: event,
}: {
  data: BulkCreateTracesAndSpansEvent
}) => {
  const { traces, spans, workspaceId } = event.data
  const workspace = await unsafelyFindWorkspace(workspaceId)
  if (!workspace) throw new NotFoundError(`Workspace not found ${workspaceId}`)

  const websockets = await WebsocketClient.getSocket()

  websockets.emit('tracesAndSpansCreated', {
    workspaceId: workspace.id,
    data: {
      workspaceId: workspace.id,
      traces,
      spans,
    },
  })
}
