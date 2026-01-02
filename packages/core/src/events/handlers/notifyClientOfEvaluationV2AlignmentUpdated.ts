import { EvaluationV2AlignmentUpdatedEvent } from '../events'
import { WebsocketClient } from '../../websockets/workers'

export const notifyClientOfEvaluationV2AlignmentUpdated = async ({
  data: event,
}: {
  data: EvaluationV2AlignmentUpdatedEvent
}) => {
  const { workspaceId, evaluationUuid, alignmentMetricMetadata } = event.data

  await WebsocketClient.sendEvent('evaluationV2AlignmentMetricUpdated', {
    workspaceId,
    data: {
      evaluationUuid,
      alignmentMetricMetadata,
    },
  })
}
