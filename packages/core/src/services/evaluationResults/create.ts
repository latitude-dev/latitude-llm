import {
  DocumentLog,
  EvaluationDto,
  EvaluationMetadataType,
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

function getResultableType(
  evaluation: EvaluationDto,
): EvaluationResultableType {
  if (evaluation.metadataType === EvaluationMetadataType.LlmAsJudgeLegacy) {
    return evaluation.metadata.configuration.type
  }

  switch (evaluation.metadataType) {
    case EvaluationMetadataType.LlmAsJudgeBoolean:
      return EvaluationResultableType.Boolean
    case EvaluationMetadataType.LlmAsJudgeNumerical:
      return EvaluationResultableType.Number
    case EvaluationMetadataType.LlmAsJudgeCustom:
      return EvaluationResultableType.Text
  }
}

function getResultableTable(type: EvaluationResultableType) {
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
  reason: string
}
export type CreateEvaluationResultProps = {
  uuid: string
  evaluation: EvaluationDto
  documentLog: DocumentLog
  providerLog?: ProviderLog
  result: EvaluationResultObject | undefined
}

type MaybeFailedEvaluationResultDto = Omit<EvaluationResultDto, 'result'> & {
  result: EvaluationResultDto['result'] | undefined
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
  const resultableType = getResultableType(evaluation)
  const resultableTable = getResultableTable(resultableType)
  let resultableId: number | undefined

  if (!resultableTable && result) {
    return Result.error(
      new BadRequestError(
        `Unsupported evaluation type: ${evaluation.metadataType}`,
      ),
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
        providerLogId: providerLog?.id,
        resultableType,
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
