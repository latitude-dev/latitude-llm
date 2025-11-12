import { DocumentVersion } from '@latitude-data/constants'
import {
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
} from '../../../constants'
import { database } from '../../../client'
import { and, desc, eq, getTableColumns, isNull, SQL, sql } from 'drizzle-orm'
import { commits } from '../../../schema/models/commits'
import { documentLogs } from '../../../schema/models/documentLogs'
import { buildLogsFilterSQLConditions } from '../logsFilterUtils'
import { calculateOffset } from '../../../lib/pagination'

export async function findDocumentLogs(
  {
    document,
    projectId,
    workspaceId,
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
    filterOptions,
  }: {
    document?: DocumentVersion
    projectId?: number
    workspaceId?: number
    page?: string
    pageSize?: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    isNull(commits.deletedAt),
    document ? eq(documentLogs.documentUuid, document.documentUuid) : undefined,
    projectId ? eq(commits.projectId, projectId) : undefined,
    workspaceId ? eq(documentLogs.workspaceId, workspaceId) : undefined,
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

  return await db
    .select({
      ...getTableColumns(documentLogs),
      commit: getTableColumns(commits),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(and(...conditions))
    .orderBy(...ordering)
    .limit(parseInt(pageSize))
    .offset(offset)
}

export async function computeDocumentLogsWithMetadataCount(
  {
    document,
    projectId,
    workspaceId,
    filterOptions,
  }: {
    document?: DocumentVersion
    projectId?: number
    workspaceId?: number
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    document ? eq(documentLogs.documentUuid, document.documentUuid) : undefined,
    projectId ? eq(commits.projectId, projectId) : undefined,
    workspaceId ? eq(documentLogs.workspaceId, workspaceId) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
  const countList = await db
    .select({
      count: sql<number>`count(*)`.as('total_count'),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .where(and(...conditions))

  return countList?.[0]?.count ? Number(countList[0].count) : 0
}
