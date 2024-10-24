import { and, count, eq, sum } from 'drizzle-orm'

import { getCommitFilter } from '../_createEvaluationResultQuery'
import { Commit, Evaluation } from '../../../browser'
import { database } from '../../../client'
import { EvaluationResultsRepository } from '../../../repositories'
import { commits, documentLogs, providerLogs } from '../../../schema'

export async function getEvaluationTotalsQuery(
  {
    workspaceId,
    evaluation,
    documentUuid,
    commit,
  }: {
    workspaceId: number
    evaluation: Evaluation
    documentUuid: string
    commit: Commit
  },
  db = database,
) {
  const { scope } = new EvaluationResultsRepository(workspaceId, db)
  const evaluationResultsScope = scope.as('evaluation_results_scope')

  const result = await db
    .select({
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(evaluationResultsScope)
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResultsScope.documentLogId),
    )
    .innerJoin(
      providerLogs,
      eq(providerLogs.id, evaluationResultsScope.providerLogId),
    )
    .where(
      and(
        eq(evaluationResultsScope.evaluationId, evaluation.id),
        eq(documentLogs.documentUuid, documentUuid),
      ),
    )
    .limit(1)

  const resultCount = await db
    .select({
      totalCount: count(evaluationResultsScope.id),
    })
    .from(evaluationResultsScope)
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResultsScope.documentLogId),
    )
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(
      and(
        eq(evaluationResultsScope.evaluationId, evaluation.id),
        eq(documentLogs.documentUuid, documentUuid),
        getCommitFilter(commit),
      ),
    )
    .limit(1)

  const costsQuery = result[0]!
  const tokens = costsQuery.tokens
  const costInMillicents = costsQuery.costInMillicents
  const totalCount = resultCount[0]!.totalCount

  return {
    tokens: tokens === null ? 0 : tokens,
    costInMillicents: costInMillicents === null ? 0 : costInMillicents,
    totalCount,
  }
}
