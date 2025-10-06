import { and, eq, getTableColumns, isNull, SQL, sql } from 'drizzle-orm'

import { DocumentLogFilterOptions } from '../../constants'
import { DocumentVersion } from '../../schema/types'
import { database } from '../../client'
import { documentLogs } from '../../schema/models/documentLogs'
import { runErrors } from '../../schema/models/runErrors'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'
import { decodeCursor } from '../../lib/pagination/keysetPagination'

export async function fetchDocumentLogByCursor(
  {
    document,
    cursor,
    filterOptions,
  }: {
    document: DocumentVersion
    cursor: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const decodedCursor = decodeCursor(cursor)
  if (!decodedCursor) {
    return null
  }

  const conditions = [
    isNull(runErrors.id),
    eq(documentLogs.documentUuid, document.documentUuid),
    eq(documentLogs.id, decodedCursor.id),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean) as SQL<unknown>[]

  const result = await db
    .select(getTableColumns(documentLogs))
    .from(documentLogs)
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, sql`document_log`),
      ),
    )
    .where(and(...conditions))
    .limit(1)

  return result[0] || null
}

export async function fetchDocumentLogWithMetadataByCursor(
  {
    document,
    cursor,
    filterOptions,
  }: {
    document: DocumentVersion
    cursor: string
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
) {
  const decodedCursor = decodeCursor(cursor)
  if (!decodedCursor) {
    return null
  }

  const conditions = [
    eq(documentLogs.documentUuid, document.documentUuid),
    eq(documentLogs.id, decodedCursor.id),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean) as SQL<unknown>[]

  const result = await db
    .select({
      ...getTableColumns(documentLogs),
      error: {
        ...getTableColumns(runErrors),
      },
    })
    .from(documentLogs)
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, sql`document_log`),
      ),
    )
    .where(and(...conditions))
    .limit(1)

  return result[0] || null
}
