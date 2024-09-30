import { eq } from 'drizzle-orm'

import { EvaluationRunEvent } from '.'
import { database } from '../../client'
import { ChainObjectResponse } from '../../constants'
import {
  unsafelyFindDocumentLogByUuid,
  unsafelyFindEvaluation,
  unsafelyFindProviderLogByUuid,
} from '../../data-access'
import { NotFoundError } from '../../lib'
import { createEvaluationResult } from '../../services/evaluationResults'
import { createEvaluationResultQuery } from '../../services/evaluationResults/_createEvaluationResultQuery'
import { WebsocketClient } from '../../websockets/workers'

export const createEvaluationResultJob = async ({
  data: event,
}: {
  data: EvaluationRunEvent
}) => {
  const websockets = await WebsocketClient.getSocket()
  const { evaluationId, documentLogUuid, providerLogUuid, response } =
    event.data

  const evaluation = await unsafelyFindEvaluation(evaluationId)
  if (!evaluation) throw new NotFoundError('Evaluation not found')

  const documentLog = await unsafelyFindDocumentLogByUuid(documentLogUuid)
  if (!documentLog) throw new NotFoundError('Document log not found')

  const providerLog = await unsafelyFindProviderLogByUuid(providerLogUuid)
  if (!providerLog) throw new NotFoundError('Provider log not found')

  const evaluationResult = await createEvaluationResult({
    evaluation,
    documentLog,
    providerLog,
    result: (response as ChainObjectResponse).object,
  }).then((r) => r.unwrap())
  evaluationResult.id

  const { evaluationResultsScope, baseQuery } = createEvaluationResultQuery(
    evaluation.workspaceId,
    database,
  )
  const result = await baseQuery
    .where(eq(evaluationResultsScope.id, evaluationResult.id))
    .limit(1)
  const row = result[0]!
  websockets.emit('evaluationResultCreated', {
    workspaceId: evaluation.workspaceId,
    data: {
      documentUuid: event.data.documentUuid,
      workspaceId: evaluation.workspaceId,
      evaluationId: evaluation.id,
      evaluationResultId: evaluationResult.id,
      row,
    },
  })
}
