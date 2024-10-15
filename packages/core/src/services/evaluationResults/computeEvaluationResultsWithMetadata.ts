import { and, desc, eq } from 'drizzle-orm'

import { Commit, Evaluation } from '../../browser'
import { database } from '../../client'
import { getCommitFilter } from './_createEvaluationResultQuery'
import { createEvaluationResultQueryWithErrors } from './_createEvaluationResultQueryWithErrors'

export function computeEvaluationResultsWithMetadataQuery(
  {
    workspaceId,
    evaluation,
    documentUuid,
    draft,
  }: {
    workspaceId: number
    evaluation: Evaluation
    documentUuid: string
    draft?: Commit
  },
  db = database,
) {
  const { evaluationResultsScope, documentLogsScope, baseQuery } =
    createEvaluationResultQueryWithErrors(workspaceId, db)
  return baseQuery
    .where(
      and(
        eq(evaluationResultsScope.evaluationId, evaluation.id),
        eq(documentLogsScope.documentUuid, documentUuid),
        getCommitFilter(draft),
      ),
    )
    .orderBy(desc(evaluationResultsScope.createdAt))
}
