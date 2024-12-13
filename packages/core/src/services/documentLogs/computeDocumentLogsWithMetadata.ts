import { and, desc, eq, isNotNull, or, sql } from 'drizzle-orm'

import {
  Commit,
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
} from '../../browser'
import { database } from '../../client'
import { calculateOffset } from '../../lib/pagination/calculateOffset'
import { DocumentLogsWithMetadataAndErrorsRepository } from '../../repositories/documentLogsWithMetadataAndErrorsRepository'
import { commits, documentLogs, projects, workspaces } from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'

export function getCommitFilter(draft?: Commit) {
  return draft
    ? or(isNotNull(commits.mergedAt), eq(commits.id, draft.id))
    : isNotNull(commits.mergedAt)
}

export function computeDocumentLogsWithMetadataQuery(
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
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspaceId, db)
  const offset = calculateOffset(page, pageSize)
  const conditions = [
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

export async function computeDocumentLogsWithMetadataCount(
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
    eq(workspaces.id, workspaceId),
    documentUuid ? eq(documentLogs.documentUuid, documentUuid) : undefined,
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean)
  const countList = await db
    .select({
      count: sql<number>`count(*)`.as('total_count'),
    })
    .from(documentLogs)
    .innerJoin(commits, eq(commits.id, documentLogs.commitId))
    .innerJoin(projects, eq(projects.id, commits.projectId))
    .innerJoin(workspaces, eq(workspaces.id, projects.workspaceId))
    .where(and(...conditions))

  return countList?.[0]?.count ? Number(countList[0].count) : 0
}
