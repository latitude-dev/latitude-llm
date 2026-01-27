import { sql } from 'drizzle-orm'
import { database } from '../../../client'
import { MAIN_SPAN_TYPES } from '../../../constants'

const NUMBER_OF_WEEKS = 4
const DAYS_IN_WEEK = 7
const LAST_PAST_DAYS = NUMBER_OF_WEEKS * DAYS_IN_WEEK

/**
 * Gets workspace IDs that have had main spans (Prompt, Chat, External) created in the last 4 weeks.
 * Used to filter which workspaces should receive weekly email reports.
 * Excludes workspaces marked as big accounts (isBigAccount = true).
 *
 * Uses a LATERAL join to force PostgreSQL to use a nested loop strategy,
 * which leverages the workspace_id index and terminates early per workspace.
 */
export async function getActiveWorkspacesForWeeklyEmail(db = database) {
  const fourWeeksAgo = new Date()
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - LAST_PAST_DAYS)
  const mainSpanTypes = Array.from(MAIN_SPAN_TYPES)

  const result = await db.execute<{ id: string }>(sql`
    SELECT w.id
    FROM latitude.workspaces w
    CROSS JOIN LATERAL (
      SELECT 1
      FROM latitude.spans s
      WHERE s.workspace_id = w.id
        AND s.type IN (${sql.join(
          mainSpanTypes.map((t) => sql`${t}`),
          sql`, `,
        )})
        AND s.started_at >= ${fourWeeksAgo}
      LIMIT 1
    ) AS has_activity
    WHERE w.is_big_account = false
  `)

  return result.rows
}
