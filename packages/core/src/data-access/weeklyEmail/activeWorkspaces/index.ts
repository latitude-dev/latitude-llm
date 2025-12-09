import { and, eq, gte, inArray } from 'drizzle-orm'
import { database } from '../../../client'
import { SpanType } from '../../../constants'
import { spans } from '../../../schema/models/spans'
import { workspaces } from '../../../schema/models/workspaces'

const NUMBER_OF_WEEKS = 4
const DAYS_IN_WEEK = 7
const LAST_PAST_DAYS = NUMBER_OF_WEEKS * DAYS_IN_WEEK

/**
 * Gets workspaces that have had prompt spans created in the last 4 weeks.
 * Used to filter which workspaces should receive weekly email reports.
 * Excludes workspaces marked as big accounts (isBigAccount = true).
 */
export async function getActiveWorkspacesForWeeklyEmail(db = database) {
  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - LAST_PAST_DAYS)

  const activeWorkspaceIds = await db
    .selectDistinct({ workspaceId: spans.workspaceId })
    .from(spans)
    .where(
      and(eq(spans.type, SpanType.Prompt), gte(spans.startedAt, fourWeeksAgo)),
    )

  if (activeWorkspaceIds.length === 0) return []

  const activeWorkspaces = await db
    .select()
    .from(workspaces)
    .where(
      and(
        inArray(
          workspaces.id,
          activeWorkspaceIds.map((w) => w.workspaceId),
        ),
        eq(workspaces.isBigAccount, false),
      ),
    )

  return activeWorkspaces
}
