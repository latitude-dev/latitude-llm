import { endOfDay } from 'date-fns'
import { and, between, eq, inArray, or, sql } from 'drizzle-orm'
import { DocumentLogFilterOptions } from '../../../constants'
import { documentLogs } from '../../../schema'

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
}: DocumentLogFilterOptions) {
  const createdAt = safeCreatedAt(unsafeCreatedAt)
  return and(
    commitIds.length
      ? or(inArray(documentLogs.commitId, commitIds))
      : sql`1 = 0`, // Return none
    logSources.length
      ? or(inArray(documentLogs.source, logSources))
      : sql`1 = 0`, // Return none
    createdAt
      ? and(between(documentLogs.createdAt, createdAt.from, createdAt.to))
      : sql`1 = 1`, // Return all if createdAt is not set
    customIdentifier
      ? and(eq(documentLogs.customIdentifier, customIdentifier))
      : sql`1 = 1`, // Return all if customIdentifier is not set
  )
}
