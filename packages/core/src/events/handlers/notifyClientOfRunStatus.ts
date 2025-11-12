import { WebsocketClient } from '../../websockets/workers'
import { RunStatusEvent } from '../events'

export const notifyClientOfRunStatus = async ({
  data: event,
}: {
  data: RunStatusEvent
}) => {
  const { workspaceId, projectId, runUuid } = event.data

  await WebsocketClient.sendEvent('runStatus', {
    workspaceId,
    data: { event: event.type, workspaceId, projectId, runUuid },
  })
}
