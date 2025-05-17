import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  or,
  SQL,
  sql,
  sum,
} from 'drizzle-orm'

import {
  Commit,
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
  ErrorableEntity,
} from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import { commits, documentLogs, providerLogs, runErrors } from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export function getCommitFilter(draft?: Commit) {
  return draft
    ? or(isNotNull(commits.mergedAt), eq(commits.id, draft.id))
    : isNotNull(commits.mergedAt)
}

export async function computeDocumentLogsWithMetadata(
  {
    documentUuid,
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
    filterOptions,
  }: {
    documentUuid: string
    page?: string
    pageSize?: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    documentUuid ? eq(documentLogs.documentUuid, documentUuid) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
  const offset = calculateOffset(page, pageSize)
  const ordering = [
    filterOptions?.customIdentifier
      ? desc(
          sql`similarity(${documentLogs.customIdentifier}, ${filterOptions.customIdentifier})`,
        )
      : undefined,
    desc(documentLogs.createdAt),
  ].filter(Boolean) as SQL<unknown>[]

  const logs = await db
    .select()
    .from(documentLogs)
    .where(and(...conditions))
    .orderBy(...ordering)
    .limit(parseInt(pageSize))
    .offset(offset)
  const providerLogAggregations = await db
    .select({
      documentLogUuid: providerLogs.documentLogUuid,
      tokens: sum(providerLogs.tokens).mapWith(Number).as('tokens'),
      duration: sum(providerLogs.duration).mapWith(Number).as('duration_in_ms'),
      costInMillicents: sum(providerLogs.costInMillicents)
        .mapWith(Number)
        .as('cost_in_millicents'),
    })
    .from(providerLogs)
    .where(
      and(
        inArray(
          providerLogs.documentLogUuid,
          logs.map((l) => l.uuid),
        ),
      ),
    )
    .groupBy(providerLogs.documentLogUuid)
  const errors = await db
    .select({
      code: runErrors.code,
      message: runErrors.message,
      details: runErrors.details,
      documentLogUuid: runErrors.errorableUuid,
    })
    .from(runErrors)
    .where(
      and(
        inArray(
          runErrors.errorableUuid,
          logs.map((l) => l.uuid),
        ),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )

  return logs.map((log) => ({
    ...log,
    tokens:
      providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
        ?.tokens ?? 0,
    duration:
      providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
        ?.duration ?? 0,
    costInMillicents:
      providerLogAggregations.find((a) => a.documentLogUuid === log.uuid)
        ?.costInMillicents ?? 0,
    errors: errors.filter((e) => e.documentLogUuid === log.uuid),
  }))
}

export async function computeDocumentLogsWithMetadataCount(
  {
    documentUuid,
    filterOptions,
  }: {
    documentUuid: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    eq(documentLogs.documentUuid, documentUuid),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
  const countList = await db
    .select({
      count: sql<number>`count(*)`.as('total_count'),
    })
    .from(documentLogs)
    .where(and(...conditions))

  return countList?.[0]?.count ? Number(countList[0].count) : 0
}
