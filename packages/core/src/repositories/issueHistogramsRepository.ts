import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import RepositoryLegacy from './repository'
import { issueHistograms } from '../schema/models/issueHistograms'
import {
  ESCALATING_DAYS,
  RECENT_ISSUES_DAYS,
  HISTOGRAM_SUBQUERY_ALIAS,
} from '@latitude-data/constants/issues'

const tt = getTableColumns(issueHistograms)

export class IssueHistogramsRepository extends RepositoryLegacy<
  typeof tt,
  Issue
> {
  get scope() {
    return this.db
      .select(tt)
      .from(issueHistograms)
      .where(eq(issueHistograms.workspaceId, this.workspaceId))
      .as('issuesHistogramsScope')
  }

  /**
   * NOTE: Developer is responsible of passing the right commit IDs
   */
  getHistogramStatsSubquery({ commitIds }: { commitIds: number[] }) {
    return this.db
      .select({
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
        firstSeenDate: sql<Date>`MIN(${issueHistograms.date})`.as(
          'firstSeenDate',
        ),
        lastSeenDate: sql<Date>`MAX(${issueHistograms.date})`.as(
          'lastSeenDate',
        ),
        escalatingCount: sql
          .raw(
            `
          COALESCE(SUM(
            CASE
              WHEN "date" >= CURRENT_DATE - INTERVAL '` +
              ESCALATING_DAYS +
              ` days'
              THEN "count"
              ELSE 0
            END
          ), 0)
        `,
          )
          .as('escalatingCount'),
        totalCount: sql<number>`COALESCE(SUM(${issueHistograms.count}), 0)`.as(
          'totalCount',
        ),
        // Add a field to detect if there are histogram entries after resolved date
        // This will be used to identify regressed issues
        maxHistogramDate: sql<Date>`MAX(${issueHistograms.date})`.as(
          'maxHistogramDate',
        ),
      })
      .from(issueHistograms)
      .where(
        and(
          eq(issueHistograms.workspaceId, this.workspaceId),
          inArray(issueHistograms.commitId, commitIds),
        ),
      )
      .groupBy(issueHistograms.issueId)
      .as(HISTOGRAM_SUBQUERY_ALIAS)
  }
}
