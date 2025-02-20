import {
  DocumentLog,
  EvaluationDto,
  EvaluationResultableType,
  EvaluationResultDto,
  ProviderLog,
} from '../../browser'
import { database } from '../../client'
import { publisher } from '../../events/publisher'
import { BadRequestError, Result, Transaction } from '../../lib'
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

export type EvaluationResultObject = {
  result: number | string | boolean
  reason?: string
}
export type CreateEvaluationResultProps = {
  uuid: string
  evaluation: EvaluationDto
  documentLog: DocumentLog
  evaluatedProviderLog: ProviderLog
  evaluationProviderLog?: ProviderLog
  result: EvaluationResultObject | undefined
  createdAt?: Date
}

type MaybeFailedEvaluationResultDto = Omit<EvaluationResultDto, 'result'> & {
  result: EvaluationResultDto['result'] | undefined
}
export async function createEvaluationResult(
  {
    uuid,
    evaluation,
    documentLog,
    evaluationProviderLog,
    evaluatedProviderLog,
    result,
    createdAt,
  }: CreateEvaluationResultProps,
  db = database,
) {
  const resultableTable = getResultable(evaluation.resultType)
  let resultableId: number | undefined

  if (!resultableTable && result) {
    return Result.error(
      new BadRequestError(`Unsupported result type: ${evaluation.resultType}`),
    )
  }

  return Transaction.call<MaybeFailedEvaluationResultDto>(async (trx) => {
    // TODO: store the reason
    if (result && resultableTable) {
      const resultable = await trx
        .insert(resultableTable)
        .values({ result: result.result })
        .returning()
      resultableId = resultable[0]!.id
    }

    // TODO: store the reason
    const inserts = await trx
      .insert(evaluationResults)
      .values({
        uuid,
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        evaluationProviderLogId: evaluationProviderLog?.id,
        evaluatedProviderLogId: evaluatedProviderLog.id,
        providerLogId: evaluationProviderLog?.id,
        resultableType: result ? evaluation.resultType : null,
        resultableId,
        source: documentLog.source,
        reason: result?.reason,
        createdAt,
      })
      .returning()

    const evaluationResult = {
      ...inserts[0]!,
      result: result?.result,
    }

    publisher.publishLater({
      type: 'evaluationResultCreated',
      data: {
        evaluationResult,
        documentLog,
        evaluation,
        workspaceId: evaluation.workspaceId,
      },
    })

    return Result.ok(evaluationResult)
  }, db)
}
