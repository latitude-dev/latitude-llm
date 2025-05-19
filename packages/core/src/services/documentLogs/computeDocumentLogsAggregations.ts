import { and, count, eq, isNotNull, isNull, sql } from 'drizzle-orm'

import {
  DocumentLogFilterOptions,
  DocumentVersion,
  ErrorableEntity,
} from '../../browser'
import { database } from '../../client'
import { commits, documentLogs, providerLogs, runErrors } from '../../schema'
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
    document,
    filterOptions,
  }: {
    document: DocumentVersion
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
): Promise<DocumentLogsAggregations> {
  const conditions = [
    isNull(runErrors.id),
    isNull(commits.deletedAt),
    eq(documentLogs.documentUuid, document.documentUuid),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

  const { totalCount, averageDuration, medianDuration } = await db
    .select({
      totalCount: count(documentLogs.id),
      averageDuration:
        sql<number>`coalesce(avg(${documentLogs.duration}), 0)`.mapWith(Number),
      medianDuration: sql<number>`
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${documentLogs.duration}), 0)
      `.mapWith(Number),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )
    .where(and(...conditions))
    .then(
      (r) =>
        r[0] ?? {
          totalCount: 0,
          averageDuration: 0,
          medianDuration: 0,
        },
    )

  const {
    totalTokens,
    totalCostInMillicents,
    averageTokens,
    averageCostInMillicents,
    medianCostInMillicents,
  } = await db
    .select({
      totalTokens:
        sql<number>`coalesce(sum(${providerLogs.tokens}), 0)`.mapWith(Number),
      totalCostInMillicents:
        sql<number>`coalesce(sum(${providerLogs.costInMillicents}), 0)`.mapWith(
          Number,
        ),
      averageTokens:
        sql<number>`coalesce(avg(${providerLogs.tokens}), 0)`.mapWith(Number),
      averageCostInMillicents:
        sql<number>`coalesce(avg(${providerLogs.costInMillicents}), 0)`.mapWith(
          Number,
        ),
      medianCostInMillicents: sql<number>`
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${providerLogs.costInMillicents}), 0)
      `.mapWith(Number),
    })
    .from(providerLogs)
    .innerJoin(
      documentLogs,
      eq(documentLogs.uuid, providerLogs.documentLogUuid),
    )
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(
      and(
        eq(documentLogs.documentUuid, document.documentUuid),
        isNull(commits.deletedAt),
        isNotNull(providerLogs.tokens),
        isNotNull(providerLogs.costInMillicents),
        filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
      ),
    )
    .then(
      (r) =>
        r[0] ?? {
          totalTokens: 0,
          totalCostInMillicents: 0,
          averageTokens: 0,
          averageCostInMillicents: 0,
          medianCostInMillicents: 0,
        },
    )

  return {
    totalCount,
    totalTokens,
    totalCostInMillicents,
    averageTokens,
    averageCostInMillicents,
    medianCostInMillicents,
    averageDuration,
    medianDuration,
  }
}
