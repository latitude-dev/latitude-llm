import { and, avg, count, eq, sql, sum } from 'drizzle-orm'

import { database } from '../../client'
import { PromisedResult, Result } from '../../lib'
import {
  CommitsRepository,
  DocumentLogsRepository,
  EvaluationResultsRepository,
  ProviderLogsRepository,
} from '../../repositories'
import { evaluationResultableNumbers } from '../../schema'
import {
  AverageResultAndCostOverCommit,
  AverageResultOverTime,
  Evaluation,
} from '../../schema/types'

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
  const { scope: evaluationResultsScope } = new EvaluationResultsRepository(
    workspaceId,
  )
  const { scope: commitsScope } = new CommitsRepository(workspaceId)
  const { scope: documentLogsScope } = new DocumentLogsRepository(workspaceId)
  const { scope: providerLogsScope } = new ProviderLogsRepository(workspaceId)

  const documentLogCost = db.$with('document_log_cost').as(
    db
      .select({
        id: documentLogsScope.id,
        costInMillicents: sum(providerLogsScope.costInMillicents)
          .mapWith(Number)
          .as('total_cost'),
      })
      .from(documentLogsScope)
      .innerJoin(
        providerLogsScope,
        eq(providerLogsScope.documentLogUuid, documentLogsScope.uuid),
      )
      .groupBy(documentLogsScope.id),
  )

  const evaluationResultsData = db.$with('evaluation_results_data').as(
    db
      .with(documentLogCost)
      .select({
        commitId: documentLogsScope.commitId,
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
        documentLogsScope,
        eq(documentLogsScope.id, evaluationResultsScope.documentLogId),
      )
      .innerJoin(documentLogCost, eq(documentLogCost.id, documentLogsScope.id))
      .innerJoin(
        evaluationResultableNumbers,
        eq(evaluationResultableNumbers.id, evaluationResultsScope.resultableId),
      )
      .where(
        and(
          eq(evaluationResultsScope.evaluationId, evaluation.id),
          eq(documentLogsScope.documentUuid, documentUuid),
        ),
      )
      .groupBy(documentLogsScope.commitId),
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
  const { scope: evaluationResultsScope } = new EvaluationResultsRepository(
    workspaceId,
  )
  const { scope: documentLogsScope } = new DocumentLogsRepository(workspaceId)

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
      documentLogsScope,
      eq(documentLogsScope.id, evaluationResultsScope.documentLogId),
    )
    .where(
      and(
        eq(evaluationResultsScope.evaluationId, evaluation.id),
        eq(documentLogsScope.documentUuid, documentUuid),
      ),
    )
    .groupBy(sql`DATE(${evaluationResultableNumbers.createdAt})`)
    .orderBy(sql`date ASC`)

  return Result.ok(results)
}
