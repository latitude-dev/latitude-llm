import { and, or, sql, inArray, between } from 'drizzle-orm'
import { documentLogs } from '../../../schema'
import { DocumentLogFilterOptions } from '../../../constants'
import { endOfDay } from 'date-fns'

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
  )
}
