import { eq } from 'drizzle-orm'

import { EvaluationResultCreatedEvent } from '.'
import { createEvaluationResultQuery } from '../../services/evaluationResults/_createEvaluationResultQuery'
import { WebsocketClient } from '../../websockets/workers'

export const notifyToClientEvaluationResultCreatedJob = async ({
  data: event,
}: {
  data: EvaluationResultCreatedEvent
}) => {
  const { evaluation, documentLog, evaluationResult } = event.data
  const { evaluationResultsScope, baseQuery } = createEvaluationResultQuery(
    evaluation.workspaceId,
  )
  const result = await baseQuery
    .where(eq(evaluationResultsScope.id, evaluationResult.id))
    .limit(1)
  const row = result[0]!

  const websockets = await WebsocketClient.getSocket()
  websockets.emit('evaluationResultCreated', {
    workspaceId: evaluation.workspaceId,
    data: {
      documentUuid: documentLog.documentUuid,
      workspaceId: evaluation.workspaceId,
      evaluationId: evaluation.id,
      evaluationResultId: evaluationResult.id,
      row,
    },
  })
}
