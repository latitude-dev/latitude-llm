import { and, desc, eq } from 'drizzle-orm'

import { Commit, Evaluation } from '../../browser'
import { database } from '../../client'
import { Result, TypedResult } from '../../lib'
import { EvaluationResultWithMetadata } from '../../repositories/evaluationResultsRepository'
import {
  createEvaluationResultQuery,
  getCommitFilter,
} from './_createEvaluationResultQuery'

export async function computeEvaluationResultsWithMetadata(
  {
    workspaceId,
    evaluation,
    documentUuid,
    draft,
    limit,
  }: {
    workspaceId: number
    evaluation: Evaluation
    documentUuid: string
    draft?: Commit
    limit?: number
  },
  db = database,
): Promise<TypedResult<EvaluationResultWithMetadata[], Error>> {
  const { evaluationResultsScope, documentLogsScope, baseQuery } =
    createEvaluationResultQuery(workspaceId, db)

  const query = baseQuery
    .where(
      and(
        eq(evaluationResultsScope.evaluationId, evaluation.id),
        eq(documentLogsScope.documentUuid, documentUuid),
        getCommitFilter(draft),
      ),
    )
    .orderBy(desc(evaluationResultsScope.createdAt))

  const result = await (limit ? query.limit(limit) : query)

  return Result.ok(result)
}
