import { eq, getTableColumns } from 'drizzle-orm'

import { EvaluationResult } from '../browser'
import { database } from '../client'
import { evaluationResults, evaluations, workspaces } from '../schema'

export const findWorkspaceFromEvaluationResult = async (
  evaluationResult: EvaluationResult,
  db = database,
) => {
  const result = await db
    .select(getTableColumns(workspaces))
    .from(workspaces)
    .innerJoin(evaluations, eq(evaluations.workspaceId, workspaces.id))
    .innerJoin(
      evaluationResults,
      eq(evaluationResults.evaluationId, evaluations.id),
    )
    .where(eq(evaluationResults.id, evaluationResult.id))
    .limit(1)

  return result[0]
}
