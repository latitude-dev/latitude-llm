import { eq } from 'drizzle-orm'

import { EvaluationDto, EvaluationMetadataType } from '../../browser'
import { database } from '../../client'
import { BadRequestError, Result, Transaction } from '../../lib'
import { evaluationMetadataLlmAsJudgeAdvanced } from '../../schema'

export async function updateAdvancedEvaluationPrompt(
  {
    evaluation,
    prompt,
  }: {
    evaluation: EvaluationDto
    prompt: string
  },
  trx = database,
) {
  if (evaluation.metadataType != EvaluationMetadataType.LlmAsJudgeAdvanced) {
    return Result.error(new BadRequestError('Invalid evaluation type'))
  }

  return await Transaction.call(async (tx) => {
    const updatedMetadata = await tx
      .update(evaluationMetadataLlmAsJudgeAdvanced)
      .set({ prompt })
      .where(eq(evaluationMetadataLlmAsJudgeAdvanced.id, evaluation.metadataId))
      .returning()

    return Result.ok({
      ...evaluation,
      metadata: updatedMetadata[0]!,
    })
  }, trx)
}
