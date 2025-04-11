import { eq } from 'drizzle-orm'

import { EvaluationDto, EvaluationMetadataType } from '../../browser'
import { database } from '../../client'
import { unsafelyFindWorkspace } from '../../data-access'
import {
  evaluationMetadataLlmAsJudgeAdvanced,
  evaluationMetadataLlmAsJudgeSimple,
  evaluations,
} from '../../schema'
import { configurationTables } from './create'
import { getEvaluationPrompt } from './prompt'
import { BadRequestError } from './../../lib/errors'
import { NotFoundError } from './../../lib/errors'
import { Result } from './../../lib/Result'
import Transaction from './../../lib/Transaction'

export async function ejectEvaluation(
  evaluation: EvaluationDto,
  db = database,
) {
  if (evaluation.metadataType !== EvaluationMetadataType.LlmAsJudgeSimple) {
    return Result.error(
      new BadRequestError('You cannot eject this evaluation type'),
    )
  }

  const workspace = await unsafelyFindWorkspace(evaluation.workspaceId)
  if (!workspace) return Result.error(new NotFoundError('Workspace not found'))

  const promptResult = await getEvaluationPrompt({
    workspace,
    evaluation,
  })
  if (promptResult.error) return promptResult

  return Transaction.call(async (tx) => {
    const metadatas = await tx
      .insert(evaluationMetadataLlmAsJudgeAdvanced)
      .values([{ prompt: promptResult.value, promptlVersion: 1 }])
      .returning()
    const metadata = metadatas[0]!

    const updateResult = await tx
      .update(evaluations)
      .set({
        metadataType: EvaluationMetadataType.LlmAsJudgeAdvanced,
        metadataId: metadata.id,
      })
      .where(eq(evaluations.id, evaluation.id))
      .returning()
    const updatedEvaluation = updateResult[0]!

    const table = configurationTables[evaluation.resultType]
    const resultConfigurations = await tx
      .select()
      .from(table)
      .where(eq(table.id, evaluation.resultConfigurationId!))
    const resultConfiguration = resultConfigurations[0]!

    await tx
      .delete(evaluationMetadataLlmAsJudgeSimple)
      .where(eq(evaluationMetadataLlmAsJudgeSimple.id, evaluation.metadataId!))

    return Result.ok({
      ...updatedEvaluation,
      metadata,
      resultConfiguration,
    } as unknown as EvaluationDto)
  }, db)
}
