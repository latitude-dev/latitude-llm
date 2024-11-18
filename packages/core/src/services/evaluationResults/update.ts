import { eq } from 'drizzle-orm'

import { EvaluationResultableType } from '../../browser'
import { database } from '../../client'
import { findWorkspaceFromEvaluationResult } from '../../data-access'
import { publisher } from '../../events/publisher'
import { BadRequestError, NotFoundError, Result, Transaction } from '../../lib'
import { EvaluationResultDto } from '../../repositories/evaluationResultsRepository'
import { evaluationResults } from '../../schema'
import { evaluationResultableBooleans } from '../../schema/models/evaluationResultableBooleans'
import { evaluationResultableNumbers } from '../../schema/models/evaluationResultableNumbers'
import { evaluationResultableTexts } from '../../schema/models/evaluationResultableTexts'

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

type UpdateEvaluationResultProps = {
  evaluationResult: EvaluationResultDto
  result: {
    result: boolean | number | string
    reason?: string
  }
}

export async function updateEvaluationResult(
  { evaluationResult, result }: UpdateEvaluationResultProps,
  db = database,
) {
  const resultableTable = getResultableTable(evaluationResult.resultableType!)
  if (!resultableTable) {
    return Result.error(
      new BadRequestError(
        `Unsupported result type: ${evaluationResult.resultableType}`,
      ),
    )
  }

  return Transaction.call(async (tx) => {
    await tx
      .update(resultableTable)
      .set({ result: result.result })
      .where(eq(resultableTable.id, evaluationResult.resultableId!))

    // Update the evaluation result reason if provided
    let updatedResult = evaluationResult
    if (result.reason) {
      updatedResult = (await tx
        .update(evaluationResults)
        .set({
          reason: result.reason,
        })
        .where(eq(evaluationResults.id, evaluationResult.id))
        .returning()
        .then((r) => r[0]!)) as EvaluationResultDto
    }

    const workspace = await findWorkspaceFromEvaluationResult(
      evaluationResult,
      tx,
    )
    if (!workspace) {
      return Result.error(new NotFoundError('Workspace not found'))
    }

    publisher.publishLater({
      type: 'evaluationResultUpdated',
      data: {
        evaluationResult: updatedResult,
        workspaceId: workspace.id,
      },
    })

    return Result.ok({
      ...updatedResult,
      result: result.result,
    })
  }, db)
}
