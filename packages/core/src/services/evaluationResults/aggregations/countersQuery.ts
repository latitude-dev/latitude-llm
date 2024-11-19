import { and, count, eq, sum } from 'drizzle-orm'

import { getCommitFilter } from '../_createEvaluationResultQuery'
import { Commit, Evaluation } from '../../../browser'
import { database } from '../../../client'
import {
  commits,
  documentLogs,
  evaluationResults,
  providerLogs,
} from '../../../schema'

export async function getEvaluationTotalsQuery(
  {
    evaluation,
    documentUuid,
    commit,
  }: {
    evaluation: Evaluation
    documentUuid: string
    commit: Commit
  },
  db = database,
) {
  const result = await db
    .select({
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(evaluationResults)
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResults.documentLogId),
    )
    .leftJoin(
      providerLogs,
      eq(providerLogs.id, evaluationResults.evaluationProviderLogId),
    )
    .where(
      and(
        eq(evaluationResults.evaluationId, evaluation.id),
        eq(documentLogs.documentUuid, documentUuid),
      ),
    )
    .limit(1)

  const resultCount = await db
    .select({
      totalCount: count(evaluationResults.id),
    })
    .from(evaluationResults)
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResults.documentLogId),
    )
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(
      and(
        eq(evaluationResults.evaluationId, evaluation.id),
        eq(documentLogs.documentUuid, documentUuid),
        getCommitFilter(commit),
      ),
    )
    .limit(1)

  const costsQuery = result[0]
  const tokens = costsQuery?.tokens ?? 0
  const costInMillicents = costsQuery?.costInMillicents ?? 0
  const totalCount = resultCount[0]!.totalCount

  return {
    tokens: tokens === null ? 0 : tokens,
    costInMillicents: costInMillicents === null ? 0 : costInMillicents,
    totalCount,
  }
}
