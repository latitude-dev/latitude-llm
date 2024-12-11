import { and, desc, eq, isNull, sql } from 'drizzle-orm'

import {
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
  ErrorableEntity,
} from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import { DocumentLogsRepository } from '../../repositories'
import {
  commits,
  documentLogs,
  projects,
  runErrors,
  workspaces,
} from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export function computeDocumentLogsQuery(
  {
    workspaceId,
    documentUuid,
    page = '1',
    pageSize = String(DEFAULT_PAGINATION_SIZE),
    filterOptions,
  }: {
    workspaceId: number
    documentUuid?: string
    page?: string
    pageSize?: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const repo = new DocumentLogsRepository(workspaceId, db)
  const offset = calculateOffset(page, pageSize)
  const conditions = [
    isNull(runErrors.id),
    eq(workspaces.id, workspaceId),
    documentUuid ? eq(documentLogs.documentUuid, documentUuid) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
  return repo.scope
    .where(and(...conditions))
    .orderBy(desc(documentLogs.createdAt))
    .limit(parseInt(pageSize))
    .offset(offset)
}

export async function computeDocumentLogsCount(
  {
    workspaceId,
    documentUuid,
    filterOptions,
  }: {
    workspaceId: number
    documentUuid: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const conditions = [
    isNull(runErrors.id),
    eq(workspaces.id, workspaceId),
    documentUuid ? eq(documentLogs.documentUuid, documentUuid) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)

  const countList = await db
    .select({
      count: sql`count(*)`.mapWith(Number).as('total_count'),
    })
    .from(documentLogs)
    .innerJoin(
      commits,
      and(isNull(commits.deletedAt), eq(commits.id, documentLogs.commitId)),
    )
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
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
