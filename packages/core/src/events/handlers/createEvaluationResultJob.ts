import { EvaluationRunEvent } from '.'
import { ChainObjectResponse } from '../../constants'
import {
  unsafelyFindDocumentLogByUuid,
  unsafelyFindEvaluation,
  unsafelyFindProviderLogByUuid,
} from '../../data-access'
import { NotFoundError } from '../../lib'
import { createEvaluationResult } from '../../services/evaluationResults'

export const createEvaluationResultJob = async ({
  data: event,
}: {
  data: EvaluationRunEvent
}) => {
  const { evaluationId, documentLogUuid, providerLogUuid, response } =
    event.data

  const evaluation = await unsafelyFindEvaluation(evaluationId)
  if (!evaluation) throw new NotFoundError('Evaluation not found')

  const documentLog = await unsafelyFindDocumentLogByUuid(documentLogUuid)
  if (!documentLog) throw new NotFoundError('Document log not found')

  const providerLog = await unsafelyFindProviderLogByUuid(providerLogUuid)
  if (!providerLog) throw new NotFoundError('Provider log not found')

  await createEvaluationResult({
    evaluation,
    documentLog,
    providerLog,
    result: (response as ChainObjectResponse).object,
  }).then((r) => r.unwrap())
}
