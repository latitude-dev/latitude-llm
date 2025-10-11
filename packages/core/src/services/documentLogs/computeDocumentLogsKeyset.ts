import { and, desc, eq, getTableColumns, isNull, SQL, sql } from 'drizzle-orm'

import { DEFAULT_PAGINATION_SIZE } from '../../constants'
import { DocumentLogFilterOptions } from '../../constants'
import { DocumentVersion } from '../../schema/types'
import { database } from '../../client'
import { documentLogs } from '../../schema/models/documentLogs'
import { runErrors } from '../../schema/models/runErrors'
import { buildLogsFilterSQLConditions } from './logsFilterUtils'
import {
  KeysetPaginationResult,
  buildKeysetConditions,
  processKeysetResults,
  getKeysetLimit,
  decodeCursor,
} from '../../lib/pagination/keysetPagination'

export async function computeDocumentLogsKeyset(
  {
    document,
    after,
    before,
    limit = DEFAULT_PAGINATION_SIZE,
    filterOptions,
  }: {
    document: DocumentVersion
    after?: string
    before?: string
    limit?: number
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
): Promise<KeysetPaginationResult<typeof documentLogs.$inferSelect>> {
  // Decode cursors
  const afterCursor = after ? decodeCursor(after) || undefined : undefined
  const beforeCursor = before ? decodeCursor(before) || undefined : undefined

  // Build base conditions
  const baseConditions = [
    isNull(runErrors.id),
    eq(documentLogs.documentUuid, document.documentUuid),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean) as SQL<unknown>[]

  // Build keyset conditions for cursor-based pagination
  const keysetCondition = buildKeysetConditions({
    after: afterCursor,
    before: beforeCursor,
    idColumn: 'document_logs.id',
    createdAtColumn: 'document_logs.created_at',
    sortDirection: 'desc',
  })

  if (keysetCondition) {
    baseConditions.push(sql.raw(keysetCondition))
  }

  // Build ordering
  const ordering = [
    filterOptions?.customIdentifier
      ? desc(
          sql`similarity(${documentLogs.customIdentifier}, ${filterOptions.customIdentifier})`,
        )
      : undefined,
    desc(documentLogs.createdAt),
    desc(documentLogs.id), // Add id as tiebreaker for consistent ordering
  ].filter(Boolean) as SQL<unknown>[]

  // Get limit with extra item for pagination detection
  const queryLimit = getKeysetLimit(limit)

  // Execute query
  const results = await db
    .select(getTableColumns(documentLogs))
    .from(documentLogs)
    .leftJoin(
      runErrors,
      and(
        eq(runErrors.errorableUuid, documentLogs.uuid),
        eq(runErrors.errorableType, sql`document_log`),
      ),
    )
    .where(and(...baseConditions))
    .orderBy(...ordering)
    .limit(queryLimit)

  // Process results and generate cursors
  return processKeysetResults({
    data: results,
    limit,
    after: afterCursor,
    before: beforeCursor,
  })
}

export async function computeDocumentLogsWithMetadataKeyset(
  {
    document,
    after,
    before,
    limit = DEFAULT_PAGINATION_SIZE,
    filterOptions,
  }: {
    document: DocumentVersion
    after?: string
    before?: string
    limit?: number
    filterOptions?: DocumentLogFilterOptions
  },
  db = database,
): Promise<KeysetPaginationResult<any>> {
  // Decode cursors
  const afterCursor = after ? decodeCursor(after) || undefined : undefined
  const beforeCursor = before ? decodeCursor(before) || undefined : undefined

  // Build base conditions
  const baseConditions = [
    eq(documentLogs.documentUuid, document.documentUuid),
    filterOptions ? buildLogsFilterSQLConditions(filterOptions) : undefined,
  ].filter(Boolean) as SQL<unknown>[]

  // Build keyset conditions for cursor-based pagination
  const keysetCondition = buildKeysetConditions({
    after: afterCursor,
    before: beforeCursor,
    idColumn: 'document_logs.id',
    createdAtColumn: 'document_logs.created_at',
    sortDirection: 'desc',
  })

  if (keysetCondition) {
    baseConditions.push(sql.raw(keysetCondition))
  }

  // Build ordering
  const ordering = [
    filterOptions?.customIdentifier
      ? desc(
          sql`similarity(${documentLogs.customIdentifier}, ${filterOptions.customIdentifier})`,
        )
      : undefined,
    desc(documentLogs.createdAt),
    desc(documentLogs.id), // Add id as tiebreaker for consistent ordering
  ].filter(Boolean) as SQL<unknown>[]

  // Get limit with extra item for pagination detection
  const queryLimit = getKeysetLimit(limit)

  // Execute query with joins for metadata
  const results = await db
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
    .where(and(...baseConditions))
    .orderBy(...ordering)
    .limit(queryLimit)

  // Process results and generate cursors
  return processKeysetResults({
    data: results,
    limit,
    after: afterCursor,
    before: beforeCursor,
  })
}
