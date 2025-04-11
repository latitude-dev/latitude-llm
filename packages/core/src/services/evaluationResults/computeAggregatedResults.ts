import { and, avg, count, eq, sql, sum } from 'drizzle-orm'

import { database } from '../../client'
import {
  CommitsRepository,
  EvaluationResultsRepository,
} from '../../repositories'
import {
  commits,
  documentLogs,
  evaluationResultableNumbers,
  projects,
  providerLogs,
} from '../../schema'
import {
  AverageResultAndCostOverCommit,
  AverageResultOverTime,
  Evaluation,
} from '../../schema/types'
import { PromisedResult } from './../../lib/Transaction'
import { Result } from './../../lib/Result'

export async function computeAverageResultAndCostOverCommit(
  {
    workspaceId,
    evaluation,
    documentUuid,
  }: {
    workspaceId: number
    evaluation: Evaluation
    documentUuid: string
  },
  db = database,
): PromisedResult<AverageResultAndCostOverCommit[]> {
  const { scope } = new EvaluationResultsRepository(workspaceId)
  const evaluationResultsScope = scope.as('evaluation_results_scope')
  const { scope: commitsScope } = new CommitsRepository(workspaceId)

  const documentLogCost = db.$with('document_log_cost').as(
    db
      .select({
        id: documentLogs.id,
        costInMillicents: sum(providerLogs.costInMillicents)
          .mapWith(Number)
          .as('total_cost'),
      })
      .from(documentLogs)
      .innerJoin(commits, eq(commits.id, documentLogs.commitId))
      .innerJoin(
        projects,
        and(
          eq(projects.id, commits.projectId),
          eq(projects.workspaceId, workspaceId),
        ),
      )
      .innerJoin(
        providerLogs,
        eq(providerLogs.documentLogUuid, documentLogs.uuid),
      )
      .groupBy(documentLogs.id),
  )

  const evaluationResultsData = db.$with('evaluation_results_data').as(
    db
      .with(documentLogCost)
      .select({
        commitId: documentLogs.commitId,
        results: count(evaluationResultableNumbers.id).as('results'),
        averageResult: avg(evaluationResultableNumbers.result)
          .mapWith(Number)
          .as('average_result'),
        averageCostInMillicents: avg(documentLogCost.costInMillicents)
          .mapWith(Number)
          .as('average_cost_in_millicents'),
      })
      .from(evaluationResultsScope)
      .innerJoin(
        documentLogs,
        eq(documentLogs.id, evaluationResultsScope.documentLogId),
      )
      .innerJoin(documentLogCost, eq(documentLogCost.id, documentLogs.id))
      .innerJoin(
        evaluationResultableNumbers,
        eq(evaluationResultableNumbers.id, evaluationResultsScope.resultableId),
      )
      .where(
        and(
          eq(evaluationResultsScope.evaluationId, evaluation.id),
          eq(documentLogs.documentUuid, documentUuid),
        ),
      )
      .groupBy(documentLogs.commitId),
  )

  const results = await db
    .with(evaluationResultsData)
    .select({
      ...commitsScope._.selectedFields,
      results: evaluationResultsData.results,
      averageResult: evaluationResultsData.averageResult,
      averageCostInMillicents: evaluationResultsData.averageCostInMillicents,
    })
    .from(commitsScope)
    .innerJoin(
      evaluationResultsData,
      eq(evaluationResultsData.commitId, commitsScope.id),
    )

  return Result.ok(results)
}

export async function computeAverageResultOverTime(
  {
    workspaceId,
    evaluation,
    documentUuid,
  }: {
    workspaceId: number
    evaluation: Evaluation
    documentUuid: string
  },
  db = database,
): PromisedResult<AverageResultOverTime[]> {
  const { scope } = new EvaluationResultsRepository(workspaceId)
  const evaluationResultsScope = scope.as('evaluation_results_scope')
  const parseToDate = (date: string) => {
    return new Date(date)
  }

  const results = await db
    .select({
      date: sql`DATE(${evaluationResultableNumbers.createdAt})`
        .mapWith(parseToDate)
        .as('date'),
      averageResult: avg(evaluationResultableNumbers.result)
        .mapWith(Number)
        .as('average_result'),
      count: count(evaluationResultableNumbers.id).as('count'),
    })
    .from(evaluationResultableNumbers)
    .innerJoin(
      evaluationResultsScope,
      eq(evaluationResultsScope.resultableId, evaluationResultableNumbers.id),
    )
    .innerJoin(
      documentLogs,
      eq(documentLogs.id, evaluationResultsScope.documentLogId),
    )
    .where(
      and(
        eq(evaluationResultsScope.evaluationId, evaluation.id),
        eq(documentLogs.documentUuid, documentUuid),
      ),
    )
    .groupBy(sql`DATE(${evaluationResultableNumbers.createdAt})`)
    .orderBy(sql`date ASC`)

  return Result.ok(results)
}
