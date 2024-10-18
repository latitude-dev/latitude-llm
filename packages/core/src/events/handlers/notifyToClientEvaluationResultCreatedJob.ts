import { eq } from 'drizzle-orm'

import { createEvaluationResultQueryWithErrors } from '../../services/evaluationResults/_createEvaluationResultQueryWithErrors'
import { WebsocketClient } from '../../websockets/workers'
import { EvaluationResultCreatedEvent } from '../events'

export const notifyToClientEvaluationResultCreatedJob = async ({
  data: event,
}: {
  data: EvaluationResultCreatedEvent
}) => {
  const { evaluation, documentLog, evaluationResult } = event.data
  // FIXME: DRY. This should be using same query as
  // computeEvaluationResultsWithMetadata
  const { evaluationResultsScope, baseQuery } =
    createEvaluationResultQueryWithErrors(evaluation.workspaceId)
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
