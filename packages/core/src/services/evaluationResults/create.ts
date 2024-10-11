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
  evaluation: Evaluation | EvaluationDto
  documentLog: DocumentLog
  providerLog?: ProviderLog
  result: { result: number | string | boolean; reason: string } | undefined
}

type MaybeFailedEvaluationResultDto = Omit<EvaluationResultDto, 'result'> & {
  result: EvaluationResultDto['result'] | undefined
}
export async function createEvaluationResult(
  { evaluation, documentLog, providerLog, result }: CreateEvaluationResultProps,
  db = database,
) {
  const resultableTable = getResultable(evaluation.configuration.type)

  if (!resultableTable) {
    return Result.error(
      new BadRequestError(
        `Unsupported result type: ${evaluation.configuration.type}`,
      ),
    )
  }

  let resultableId: number | undefined

  return Transaction.call<MaybeFailedEvaluationResultDto>(async (trx) => {
    // TODO: store the reason
    if (result) {
      const resultable = await trx
        .insert(resultableTable)
        .values({ result: result.result })
        .returning()
      resultableId = resultable[0]!.id
    }

    const inserts = await trx
      .insert(evaluationResults)
      .values({
        uuid: generateUUIDIdentifier(),
        evaluationId: evaluation.id,
        documentLogId: documentLog.id,
        providerLogId: providerLog?.id,
        resultableType: evaluation.configuration.type,
        resultableId,
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
      result: result?.result,
    })
  }, db)
}
