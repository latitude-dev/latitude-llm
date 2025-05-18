import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  or,
  SQL,
  sql,
  sum,
} from 'drizzle-orm'

import {
  Commit,
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
  DocumentVersion,
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
    document,
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
    filterOptions,
  }: {
    document: DocumentVersion
    page?: string
    pageSize?: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    eq(documentLogs.documentUuid, document.documentUuid),
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
    .select({
      ...getTableColumns(documentLogs),
      commit: getTableColumns(commits),
    })
    .from(documentLogs)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
    )
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
      code: sql<string>`${runErrors.code}`,
      message: sql<string>`${runErrors.message}`,
      details: sql<string>`${runErrors.details}`,
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

  return logs.map((log) => {
    return {
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
      error: errors.find((e) => e.documentLogUuid === log.uuid) || {
        code: null,
        message: null,
        details: null,
      },
    }
  })
}

export async function computeDocumentLogsWithMetadataCount(
  {
    document,
    filterOptions,
  }: {
    document: DocumentVersion
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    eq(documentLogs.documentUuid, document.documentUuid),
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
