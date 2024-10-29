import { and, eq, sql } from 'drizzle-orm'

import { getCommitFilter } from '../_createEvaluationResultQuery'
import { Commit, EvaluationDto } from '../../../browser'
import { database } from '../../../client'
import { EvaluationResultsRepository } from '../../../repositories'
import { commits, documentLogs } from '../../../schema'

export async function getEvaluationMeanValueQuery(
  {
    workspaceId,
    evaluation,
    documentUuid,
    commit,
  }: {
    workspaceId: number
    evaluation: EvaluationDto
    documentUuid: string
    commit: Commit
  },
  db = database,
) {
  const { scope } = new EvaluationResultsRepository(workspaceId, db)
  const evaluationResultsScope = scope.as('evaluation_results_scope')

  const results = await db
    .select({
      meanValue: sql`avg(${evaluationResultsScope.result}::numeric)`
        .mapWith(Number)
        .as('meanValue'),
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
  const value = results[0]
  const config = evaluation.metadata.configuration
  const { from: minValue, to: maxValue } = config.detail!.range
  return {
    minValue,
    maxValue,
    meanValue: value?.meanValue ?? 0,
  }
}
