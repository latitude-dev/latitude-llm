import { EvaluationStatusEvent } from '../events'
import { WebsocketClient } from '../../websockets/workers'

export const notifyClientOfEvaluationStatus = async ({
  data: event,
}: {
  data: EvaluationStatusEvent
}) => {
  const { workspaceId, projectId, evaluation } = event.data

  await WebsocketClient.sendEvent('evaluationStatus', {
    workspaceId,
    data: { event: event.type, workspaceId, projectId, evaluation },
  })
}
