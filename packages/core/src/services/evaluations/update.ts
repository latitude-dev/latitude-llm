import { eq } from 'drizzle-orm'

import { EvaluationDto } from '../../browser'
import { database } from '../../client'
import { Result, Transaction } from '../../lib'
import { compactObject } from '../../lib/compactObject'
import { evaluations, llmAsJudgeEvaluationMetadatas } from '../../schema'

export async function updateEvaluation(
  {
    evaluation,
    name,
    description,
    metadata = {},
  }: {
    evaluation: EvaluationDto
    name?: string
    description?: string
    metadata: Record<string, unknown>
  },
  trx = database,
) {
  return await Transaction.call(async (tx) => {
    const updatedEvals = await tx
      .update(evaluations)
      .set(compactObject({ name, description }))
      .where(eq(evaluations.id, evaluation.id))
      .returning()

    const updatedMetadata = await tx
      .update(llmAsJudgeEvaluationMetadatas)
      .set(compactObject(metadata))
      .where(eq(llmAsJudgeEvaluationMetadatas.id, evaluation.metadata.id))
      .returning()

    return Result.ok({
      ...updatedEvals[0]!,
      metadata: updatedMetadata[0]!,
    })
  }, trx)
}
