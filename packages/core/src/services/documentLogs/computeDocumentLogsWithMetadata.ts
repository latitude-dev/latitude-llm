import { and, eq, isNotNull, or, sql } from 'drizzle-orm'

import {
  Commit,
  DEFAULT_PAGINATION_SIZE,
  DocumentLogFilterOptions,
  DocumentVersion,
  Workspace,
} from '../../browser'
import { database } from '../../client'
import { commits, documentLogs } from '../../schema'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'
import { DocumentLogWithMetadataAndError } from '../../repositories/runErrors/documentLogsRepository'
import {
  DocumentLogsWithMetadataAndErrorsCursor,
  DocumentLogsWithMetadataAndErrorsRepository,
} from '../../repositories/documentLogsWithMetadataAndErrorsRepository'

export function getCommitFilter(draft?: Commit) {
  return draft
    ? or(isNotNull(commits.mergedAt), eq(commits.id, draft.id))
    : isNotNull(commits.mergedAt)
}

export async function computeDocumentLogsWithMetadataWithCursor({
  workspace,
  documentUuid,
  extendedFilterOptions,
  cursor,
  limit = DEFAULT_PAGINATION_SIZE,
}: {
  workspace: Workspace
  documentUuid: string
  extendedFilterOptions?: DocumentLogFilterOptions
  cursor?: Date
  limit?: number
}): Promise<{
  logs: DocumentLogWithMetadataAndError[]
  nextCursor?: DocumentLogsWithMetadataAndErrorsCursor
}> {
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspace.id)
  const result = await repo.findInDocumentWithCursor(
    documentUuid,
    limit,
    cursor,
    extendedFilterOptions,
  )
  return result.unwrap()
}

export async function computeDocumentLogsWithMetadataPaginated({
  workspace,
  documentUuid,
  filterOptions,
  page = 1,
  size = DEFAULT_PAGINATION_SIZE,
}: {
  workspace: Workspace
  documentUuid: string
  filterOptions?: DocumentLogFilterOptions
  page?: number
  size?: number
}): Promise<DocumentLogWithMetadataAndError[]> {
  const repo = new DocumentLogsWithMetadataAndErrorsRepository(workspace.id)
  const result = await repo.findInDocumentPaginated(
    documentUuid,
    page,
    size,
    filterOptions,
  )
  return result.unwrap()
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
