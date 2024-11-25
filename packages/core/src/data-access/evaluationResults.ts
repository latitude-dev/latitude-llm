import { eq } from 'drizzle-orm'

import { EvaluationResultDto } from '../browser'
import { database } from '../client'
import { workspacesDtoColumns } from '../repositories'
import {
  evaluationResults,
  evaluations,
  subscriptions,
  workspaces,
} from '../schema'

export const findWorkspaceFromEvaluationResult = async (
  evaluationResult: EvaluationResultDto,
  db = database,
) => {
  const result = await db
    .select(workspacesDtoColumns)
    .from(workspaces)
    .innerJoin(
      subscriptions,
      eq(workspaces.currentSubscriptionId, subscriptions.id),
    )
    .innerJoin(evaluations, eq(evaluations.workspaceId, workspaces.id))
    .innerJoin(
      evaluationResults,
      eq(evaluationResults.evaluationId, evaluations.id),
    )
    .where(eq(evaluationResults.id, evaluationResult.id))
    .limit(1)

  return result[0]
}
