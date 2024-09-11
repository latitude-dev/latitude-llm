import {
  DocumentLog,
  Evaluation,
  EvaluationDto,
  EvaluationResult,
  ProviderLog,
} from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { evaluationResults } from '../../schema'

export type CreateEvaluationResultProps = {
  evaluation: Evaluation | EvaluationDto
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
