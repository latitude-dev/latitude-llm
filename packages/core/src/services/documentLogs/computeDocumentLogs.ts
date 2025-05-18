import { and, desc, eq, isNull, SQL, sql } from 'drizzle-orm'

import {
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
  DocumentVersion,
  ErrorableEntity,
} from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import { commits, documentLogs, runErrors } from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export function computeDocumentLogs(
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
  const offset = calculateOffset(page, pageSize)
  const conditions = [
    isNull(runErrors.id),
    eq(documentLogs.documentUuid, document.documentUuid),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
  const ordering = [
    filterOptions?.customIdentifier
      ? desc(
          sql`similarity(${documentLogs.customIdentifier}, ${filterOptions.customIdentifier})`,
        )
      : undefined,
    desc(documentLogs.createdAt),
  ].filter(Boolean) as SQL<unknown>[]

  return db
    .select()
    .from(documentLogs)
    .where(and(...conditions))
    .orderBy(...ordering)
    .limit(parseInt(pageSize))
    .offset(offset)
}

export async function computeDocumentLogsCount(
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
    isNull(runErrors.id),
    isNull(commits.deletedAt),
    eq(documentLogs.documentUuid, document.documentUuid),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

  const countList = await db
    .select({
      count: sql`count(*)`.mapWith(Number).as('total_count'),
    })
    .from(documentLogs)
    .innerJoin(commits, and(eq(commits.id, documentLogs.commitId)))
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, ErrorableEntity.DocumentLog),
      ),
    )
    .where(and(...conditions))

  return countList?.[0]?.count ? Number(countList[0].count) : 0
}
