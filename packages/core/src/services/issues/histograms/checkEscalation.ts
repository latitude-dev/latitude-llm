import { format, subDays } from 'date-fns'
import { and, eq, gte, sql } from 'drizzle-orm'
import { Database } from '../../../client'
import { issueHistograms } from '../../../schema/models/issueHistograms'
import { Issue } from '../../../schema/models/types/Issue'

const ESCALATION_RECENT_DAYS = 1
const ESCALATION_WINDOW_DAYS = 7
const ESCALATION_PREVIOUS_WINDOW_DAYS = 7
const ESCALATION_MIN_THRESHOLD = 20
const ESCALATION_MULTIPLIER = 2

/**
 * Helper function to get event count for an issue within a date range
 */
async function getEventCount({
  db,
  issue,
  startDate,
  endDate,
}: {
  db: Database
  issue: Issue
  startDate: Date
  endDate?: Date
}): Promise<number> {
  const conditions = [
    eq(issueHistograms.workspaceId, issue.workspaceId),
    eq(issueHistograms.issueId, issue.id),
    gte(issueHistograms.date, sql`${format(startDate, 'yyyy-MM-dd')}::date`),
  ]

  if (endDate) {
    conditions.push(
      sql`${issueHistograms.date} < ${format(endDate, 'yyyy-MM-dd')}::date`,
    )
  }

  const result = await db
    .select({
      count: sql<number>`COALESCE(SUM(${issueHistograms.count}), 0)`,
    })
    .from(issueHistograms)
    .where(and(...conditions))

  return Number(result[0]?.count || 0)
}

/**
 * Escalation logic:
 * - There are events in the last 1 day, AND
 * - The 7-day event count is > 2× the previous 7-day average, AND
 * - The total count in that 7-day window is above a minimum threshold (20 events)
 */
export async function checkEscalation({
  issue,
  db,
}: {
  issue: Issue
  db: Database
}) {
  const now = new Date()
  const oneDayAgo = subDays(now, ESCALATION_RECENT_DAYS)
  const sevenDaysAgo = subDays(now, ESCALATION_WINDOW_DAYS)
  const fourteenDaysAgo = subDays(
    now,
    ESCALATION_WINDOW_DAYS + ESCALATION_PREVIOUS_WINDOW_DAYS,
  )

  // Query for events in the last day
  const recentCount = await getEventCount({
    db,
    issue,
    startDate: oneDayAgo,
  })

  if (recentCount === 0) return { isEscalating: false }

  // Query for current 7-day window
  const currentWindowCount = await getEventCount({
    db,
    issue,
    startDate: sevenDaysAgo,
  })

  // Check if current window meets minimum threshold
  if (currentWindowCount < ESCALATION_MIN_THRESHOLD) {
    return { isEscalating: false }
  }

  // Query for previous 7-day window (days 8-14)
  const previousWindowCount = await getEventCount({
    db,
    issue,
    startDate: fourteenDaysAgo,
    endDate: sevenDaysAgo,
  })

  // Calculate average (avoid division by zero)
  const previousAverage =
    previousWindowCount > 0
      ? previousWindowCount / ESCALATION_PREVIOUS_WINDOW_DAYS
      : 0

  // Check if current window is > 2× the previous average
  const isEscalating =
    currentWindowCount > previousAverage * ESCALATION_MULTIPLIER

  return { isEscalating }
}
