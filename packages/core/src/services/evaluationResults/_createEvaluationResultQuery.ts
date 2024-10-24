import { eq, isNotNull, or, sum } from 'drizzle-orm'

import { Commit } from '../../browser'
import { database } from '../../client'
import { DocumentLogsRepository } from '../../repositories/documentLogsRepository'
import { EvaluationResultsRepository } from '../../repositories/evaluationResultsRepository'
import { commits, documentLogs, providerLogs } from '../../schema'

export function createEvaluationResultQuery(
  workspaceId: number,
  db = database,
) {
  const { scope } = new EvaluationResultsRepository(workspaceId, db)
  const evaluationResultsScope = scope.as('evaluation_results_scope')
  const { scope: documentLogsScope } = new DocumentLogsRepository(
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
    .innerJoin(
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

export function getCommitFilter(draft?: Commit) {
  return draft
    ? or(isNotNull(commits.mergedAt), eq(commits.id, draft.id))
    : isNotNull(commits.mergedAt)
}
