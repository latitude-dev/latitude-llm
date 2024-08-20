import {
  database,
  evaluationResults,
  Result,
  Transaction,
} from '@latitude-data/core'
import {
  DocumentLog,
  Evaluation,
  EvaluationResult,
  ProviderLog,
} from '$core/browser'

export type CreateEvaluationResultProps = {
  evaluation: Evaluation
  documentLog: DocumentLog
  providerLog: ProviderLog
  result: string
}

export async function createEvaluationResult(
  { evaluation, documentLog, providerLog, result }: CreateEvaluationResultProps,
  db = database,
) {
  return Transaction.call<EvaluationResult>(async (trx) => {
    const inserts = await trx
      .insert(evaluationResults)
      .values({
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        providerLogId: providerLog.id,
        result,
      })
      .returning()

    const evaluationResult = inserts[0]!

    return Result.ok(evaluationResult)
  }, db)
}
