import { endOfDay } from 'date-fns'
import { and, between, eq, inArray, isNull, like, not, sql } from 'drizzle-orm'
import {
  DocumentLogFilterOptions,
  ExtendedDocumentLogFilterOptions,
} from '../../../constants'
import { documentLogs, runErrors } from '../../../schema'

function safeCreatedAt(createdAt: DocumentLogFilterOptions['createdAt']) {
  if (!createdAt) return undefined
  const from = createdAt.from
  if (!from) return undefined

  const to = createdAt.to ? createdAt.to : endOfDay(from)

  return { from, to }
}

export function buildLogsFilterSQLConditions({
  commitIds,
  logSources,
  createdAt: unsafeCreatedAt,
  customIdentifier,
  experimentId,
  documentLogIds,
  excludedDocumentLogIds,
  filterErrors,
}: ExtendedDocumentLogFilterOptions) {
  const createdAt = safeCreatedAt(unsafeCreatedAt)
  return and(
    commitIds?.length ? inArray(documentLogs.commitId, commitIds) : sql`1 = 0`, // Return none
    logSources?.length ? inArray(documentLogs.source, logSources) : sql`1 = 0`, // Return none
    createdAt
      ? between(documentLogs.createdAt, createdAt.from, createdAt.to)
      : sql`1 = 1`, // Return all if createdAt is not set
    customIdentifier
      ? like(documentLogs.customIdentifier, `%${customIdentifier}%`)
      : sql`1 = 1`, // Return all if customIdentifier is not set
    experimentId ? eq(documentLogs.experimentId, experimentId) : sql`1 = 1`, // Return all if experimentUuid is not set
    documentLogIds?.length
      ? inArray(documentLogs.id, documentLogIds)
      : sql`1 = 1`, // Return all if documentLogIds is not set
    excludedDocumentLogIds?.length
      ? not(inArray(documentLogs.id, excludedDocumentLogIds))
      : sql`1 = 1`, // Return all if excludedDocumentLogIds is not set
    filterErrors ? isNull(runErrors.message) : sql`1 = 1`, // Return all if filterErrors is not set
  )
}
