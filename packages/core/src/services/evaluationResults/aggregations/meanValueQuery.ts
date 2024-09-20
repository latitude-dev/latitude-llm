import { and, eq, sql } from 'drizzle-orm'

import { getCommitFilter } from '../_createEvaluationResultQuery'
import {
  Commit,
  Evaluation,
  EvaluationResultConfiguration,
} from '../../../browser'
import { database } from '../../../client'
import { EvaluationResultsRepository } from '../../../repositories'
import { DocumentLogsRepository } from '../../../repositories/documentLogsRepository'
import { commits } from '../../../schema'

export async function getEvaluationMeanValueQuery(
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
  const { scope: evaluationResultsScope } = new EvaluationResultsRepository(
    workspaceId,
    db,
  )
  const documentLogsRepo = new DocumentLogsRepository(workspaceId, db)
  const documentLogsScope = documentLogsRepo.scope

  const results = await db
    .select({
      meanValue: sql`avg(${evaluationResultsScope.result}::numeric)`
        .mapWith(Number)
        .as('meanValue'),
    })
    .from(evaluationResultsScope)
    .innerJoin(
      documentLogsScope,
      eq(documentLogsScope.id, evaluationResultsScope.documentLogId),
    )
    .innerJoin(commits, eq(commits.id, documentLogsScope.commitId))
    .where(
      and(
        eq(evaluationResultsScope.evaluationId, evaluation.id),
        eq(documentLogsScope.documentUuid, documentUuid),
        getCommitFilter(commit),
      ),
    )
  const value = results[0]
  const config = evaluation.configuration as EvaluationResultConfiguration
  const { from: minValue, to: maxValue } = config.detail!.range
  return {
    minValue,
    maxValue,
    meanValue: value?.meanValue ?? 0,
  }
}
