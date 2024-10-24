import { eq, sum } from 'drizzle-orm'

import { database } from '../../client'
import {
  DocumentLogsWithErrorsRepository,
  EvaluationResultsWithErrorsRepository,
} from '../../repositories'
import { commits, documentLogs, providerLogs } from '../../schema'

export function createEvaluationResultQueryWithErrors(
  workspaceId: number,
  db = database,
) {
  const { scope: evaluationResultsScope } =
    new EvaluationResultsWithErrorsRepository(workspaceId, db)
  const { scope: documentLogsScope } = new DocumentLogsWithErrorsRepository(
    workspaceId,
    db,
  )

  const aggregatedFieldsSubQuery = db
    .select({
      id: evaluationResultsScope.id,
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(evaluationResultsScope)
    .leftJoin(
      providerLogs,
      eq(providerLogs.id, evaluationResultsScope.providerLogId),
    )
    .groupBy(evaluationResultsScope.id)
    .as('aggregatedFieldsSubQuery')

  return {
    evaluationResultsScope,
    documentLogsScope,
    aggregatedFieldsSubQuery,
    baseQuery: db
      .select({
        ...evaluationResultsScope._.selectedFields,
        commit: commits,
        tokens: aggregatedFieldsSubQuery.tokens,
        costInMillicents: aggregatedFieldsSubQuery.costInMillicents,
        documentContentHash: documentLogs.contentHash,
      })
      .from(evaluationResultsScope)
      .innerJoin(
        documentLogs,
        eq(documentLogs.id, evaluationResultsScope.documentLogId),
      )
      .innerJoin(commits, eq(commits.id, documentLogs.commitId))
      .innerJoin(
        aggregatedFieldsSubQuery,
        eq(aggregatedFieldsSubQuery.id, evaluationResultsScope.id),
      ),
  }
}
