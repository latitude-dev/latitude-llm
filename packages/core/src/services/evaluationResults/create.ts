import {
  DocumentLog,
  Evaluation,
  EvaluationDto,
  EvaluationResultableType,
  ProviderLog,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { BadRequestError, Result, Transaction } from '../../lib'
import { EvaluationResultDto } from '../../repositories/evaluationResultsRepository'
import { evaluationResults } from '../../schema'
import { evaluationResultableBooleans } from '../../schema/models/evaluationResultableBooleans'
import { evaluationResultableNumbers } from '../../schema/models/evaluationResultableNumbers'
import { evaluationResultableTexts } from '../../schema/models/evaluationResultableTexts'

function getResultable(type: EvaluationResultableType) {
  switch (type) {
    case EvaluationResultableType.Boolean:
      return evaluationResultableBooleans
    case EvaluationResultableType.Number:
      return evaluationResultableNumbers
    case EvaluationResultableType.Text:
      return evaluationResultableTexts
    default:
      return null
  }
}

export type CreateEvaluationResultProps = {
  uuid: string
  evaluation: Evaluation | EvaluationDto
  documentLog: DocumentLog
  providerLog: ProviderLog
  result: { result: number | string | boolean; reason: string } | undefined
}

export async function createEvaluationResult(
  {
    uuid,
    evaluation,
    documentLog,
    providerLog,
    result,
  }: CreateEvaluationResultProps,
  db = database,
) {
  const resultable = getResultable(evaluation.configuration.type)

  if (!resultable) {
    return Result.error(
      new BadRequestError(
        `Unsupported result type: ${evaluation.configuration.type}`,
      ),
    )
  }

  let metadataId: number | undefined

  return Transaction.call<EvaluationResultDto>(async (trx) => {
    // TODO: store the reason
    if (result) {
      const metadata = await trx
        .insert(resultable)
        .values({ result: result.result })
        .returning()
      metadataId = metadata[0]!.id
    }
    const inserts = await trx
      .insert(evaluationResults)
      .values({
        uuid,
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        resultableType: evaluation.configuration.type,
        source: documentLog.source,
        resultableId: metadataId,
        // TODO: Make this nullable. An evaluation result can fail before
        // calling the AI. We want to store the result + error to let users know
        providerLogId: providerLog.id,
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
      result: result?.result,
    })
  }, db)
}
