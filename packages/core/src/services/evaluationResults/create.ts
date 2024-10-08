import {
  DocumentLog,
  Evaluation,
  EvaluationDto,
  EvaluationResultableType,
  ProviderLog,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import {
  BadRequestError,
  generateUUIDIdentifier,
  Result,
  Transaction,
} from '../../lib'
import { EvaluationResultDto } from '../../repositories/evaluationResultsRepository'
import { evaluationResults } from '../../schema'
import { evaluationResultableBooleans } from '../../schema/models/evaluationResultableBooleans'
import { evaluationResultableNumbers } from '../../schema/models/evaluationResultableNumbers'
import { evaluationResultableTexts } from '../../schema/models/evaluationResultableTexts'

export type CreateEvaluationResultProps = {
  evaluation: Evaluation | EvaluationDto
  documentLog: DocumentLog
  providerLog: ProviderLog
  result: { result: number | string | boolean; reason: string }
}

export async function createEvaluationResult(
  { evaluation, documentLog, providerLog, result }: CreateEvaluationResultProps,
  db = database,
) {
  return Transaction.call<EvaluationResultDto>(async (trx) => {
    let table
    switch (evaluation.configuration.type) {
      case EvaluationResultableType.Boolean:
        table = evaluationResultableBooleans
        break
      case EvaluationResultableType.Number:
        table = evaluationResultableNumbers
        break
      case EvaluationResultableType.Text:
        table = evaluationResultableTexts
        break
      default:
        return Result.error(
          new BadRequestError(
            `Unsupported result type: ${evaluation.configuration.type}`,
          ),
        )
    }

    // TODO: store the reason
    const metadata = await trx
      .insert(table)
      .values({ result: result.result })
      .returning()
    const inserts = await trx
      .insert(evaluationResults)
      .values({
        uuid: generateUUIDIdentifier(),
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        providerLogId: providerLog.id,
        resultableType: evaluation.configuration.type,
        resultableId: metadata[0]!.id,
        source: documentLog.source,
      })
      .returning()

    const evaluationResult = inserts[0]!

    publisher.publishLater({
      type: 'evaluationResultCreated',
      data: {
        evaluationResult,
        documentLog,
        evaluation,
        workspaceId: evaluation.workspaceId,
      },
    })

    return Result.ok({
      ...evaluationResult,
      result: metadata[0]!.result,
    })
  }, db)
}
