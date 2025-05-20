import { and, avg, count, eq, isNull, sql, sum } from 'drizzle-orm'

import {
  DocumentLogFilterOptions,
  ErrorableEntity,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import {
  commits,
  documentLogs,
  projects,
  providerLogs,
  runErrors,
} from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export type DocumentLogsAggregations = {
  totalCount: number
  totalTokens: number
  totalCostInMillicents: number
  averageTokens: number
  averageCostInMillicents: number
  medianCostInMillicents: number
  averageDuration: number
  medianDuration: number
}

export async function computeDocumentLogsAggregations(
  {
    workspace,
    documentUuid,
    filterOptions,
  }: {
    workspace: Workspace
    documentUuid: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
): Promise<DocumentLogsAggregations> {
  const conditions = [
    eq(projects.workspaceId, workspace.id),
    isNull(runErrors.id),
    documentUuid ? eq(documentLogs.documentUuid, documentUuid) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

  // TODO(perf): This query is very slow. We should optimize it.
  const baseQuery = db
    .select({
      totalCount: count(documentLogs.id),
      totalTokens: sum(providerLogs.tokens).mapWith(Number),
      totalCostInMillicents: sum(providerLogs.costInMillicents).mapWith(Number),
      averageTokens: avg(providerLogs.tokens).mapWith(Number),
      averageCostInMillicents: avg(providerLogs.costInMillicents).mapWith(
        Number,
      ),
      medianCostInMillicents: sql<number>`
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${providerLogs.costInMillicents})
      `.mapWith(Number),
      averageDuration: avg(documentLogs.duration).mapWith(Number),
      medianDuration: sql<number>`
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${documentLogs.duration})
      `.mapWith(Number),
    })
    .from(documentLogs)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
    )
    .leftJoin(
      projects,
      and(isNull(projects.deletedAt), eq(projects.id, commits.projectId)),
    )
    .leftJoin(providerLogs, eq(providerLogs.documentLogUuid, documentLogs.uuid))
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )
    .where(and(...conditions))

  const result = await baseQuery.limit(1)

  return {
    totalCount: result[0]?.totalCount ?? 0,
    totalTokens: result[0]?.totalTokens ?? 0,
    totalCostInMillicents: result[0]?.totalCostInMillicents ?? 0,
    averageTokens: result[0]?.averageTokens ?? 0,
    averageCostInMillicents: result[0]?.averageCostInMillicents ?? 0,
    medianCostInMillicents: result[0]?.medianCostInMillicents ?? 0,
    averageDuration: result[0]?.averageDuration ?? 0,
    medianDuration: result[0]?.medianDuration ?? 0,
  }
}
