import { RECENT_ISSUES_DAYS } from '@latitude-data/constants/issues'
import { sql } from 'drizzle-orm'

import { issueHistograms } from '../../schema/models/issueHistograms'

export const histogramStatsSelect = {
  issueId: issueHistograms.issueId,
  recentCount: sql
    .raw(
      `
      COALESCE(SUM(
        CASE
          WHEN "date" >= CURRENT_DATE - INTERVAL '` +
        RECENT_ISSUES_DAYS +
        ` days'
          THEN "count"
          ELSE 0
        END
      ), 0)
    `,
    )
    .as('recentCount'),
  firstSeenDate: sql<Date>`MIN(${issueHistograms.date})`.as('firstSeenDate'),
  lastSeenDate: sql<Date>`MAX(${issueHistograms.date})`.as('lastSeenDate'),
  firstOccurredAt: sql<Date>`MIN(${issueHistograms.occurredAt})`.as(
    'firstOccurredAt',
  ),
  lastOccurredAt: sql<Date>`MAX(${issueHistograms.occurredAt})`.as(
    'lastOccurredAt',
  ),
  totalCount: sql<number>`COALESCE(SUM(${issueHistograms.count}), 0)`.as(
    'totalCount',
  ),
  lastCommitId:
    sql<number>`(array_agg(${issueHistograms.commitId} ORDER BY ${issueHistograms.occurredAt} DESC))[1]`.as(
      'lastCommitId',
    ),
}
