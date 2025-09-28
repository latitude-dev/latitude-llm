import { and, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm'
import { DocumentLogFilterOptions, ErrorableEntity } from '../../constants'
import { DocumentLogsAggregations } from '../../schema/types'
import { database } from '../../client'
import { Result } from '../../lib/Result'
import { commits } from '../../schema/models/commits'
import { documentLogs } from '../../schema/models/documentLogs'
import { providerLogs } from '../../schema/models/providerLogs'
import { runErrors } from '../../schema/models/runErrors'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export async function computeDocumentLogsAggregations(
  {
    projectId,
    documentUuid,
    filterOptions,
  }: {
    projectId: number
    documentUuid: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const commitIds = await db
    .select({ id: commits.id })
    .from(commits)
    .where(and(isNull(commits.deletedAt), eq(commits.projectId, projectId)))
    .then((r) => r.map((r) => r.id))
  if (!commitIds.length) {
    return Result.ok<DocumentLogsAggregations>({
      totalCount: 0,
      totalTokens: 0,
      totalCostInMillicents: 0,
      averageTokens: 0,
      averageCostInMillicents: 0,
      medianCostInMillicents: 0,
      averageDuration: 0,
      medianDuration: 0,
    })
  }

  const conditions = [
    inArray(documentLogs.commitId, commitIds),
    eq(documentLogs.documentUuid, documentUuid),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

  const totalCountPromise = db
    .select({
      totalCount: count(),
    })
    .from(documentLogs)
    .where(and(...conditions))
    .then((r) => r[0] ?? { totalCount: 0 })

  const documentLogAggregations = db
    .select({
      averageDuration:
        sql<number>`coalesce(avg(${documentLogs.duration}), 0)`.mapWith(Number),
      medianDuration: sql<number>`
        COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY ${documentLogs.duration}), 0)
      `.mapWith(Number),
    })
    .from(documentLogs)
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
        eq(runErrors.errorableUuid, documentLogs.uuid),
      ),
    )
    .where(and(...conditions, isNull(runErrors.id)))
    .then(
      (r) =>
        r[0] ?? {
          averageDuration: 0,
          medianDuration: 0,
        },
    )

  const providerLogAggregations = db
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
    .where(
      and(
        isNotNull(providerLogs.tokens),
        isNotNull(providerLogs.costInMillicents),
        inArray(documentLogs.commitId, commitIds),
        eq(documentLogs.documentUuid, documentUuid),
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

  const [
    { averageDuration, medianDuration },
    {
      totalTokens,
      totalCostInMillicents,
      averageTokens,
      averageCostInMillicents,
      medianCostInMillicents,
    },
    { totalCount },
  ] = await Promise.all([
    documentLogAggregations,
    providerLogAggregations,
    totalCountPromise,
  ])

  return Result.ok<DocumentLogsAggregations>({
    totalCount,
    totalTokens,
    totalCostInMillicents,
    averageTokens,
    averageCostInMillicents,
    medianCostInMillicents,
    averageDuration,
    medianDuration,
  })
}
