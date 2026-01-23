import { WebsocketClient } from '../../websockets/workers'
import { DocumentRunStatusEvent } from '../events'

/**
 * Notifies clients of document-scoped run status changes via websockets.
 * This sends events with documentUuid for document-level filtering.
 */
export const notifyClientOfRunStatusByDocument = async ({
  data: event,
}: {
  data: DocumentRunStatusEvent
}) => {
  const {
    workspaceId,
    projectId,
    documentUuid,
    commitUuid,
    run,
    eventContext,
  } = event.data

  if (eventContext === 'foreground') return

  await WebsocketClient.sendEvent('documentRunStatus', {
    workspaceId,
    data: {
      event: event.type,
      workspaceId,
      projectId,
      documentUuid,
      commitUuid,
      run,
      eventContext,
    },
  })
}
