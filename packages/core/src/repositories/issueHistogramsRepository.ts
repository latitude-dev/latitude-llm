import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import RepositoryLegacy from './repository'
import { issueHistograms } from '../schema/models/issueHistograms'

const tt = getTableColumns(issueHistograms)

export const HISTOGRAM_SUBQUERY_ALIAS = 'histogramStats'

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
        last7DaysCount: sql<number>`
          COALESCE(SUM(
            CASE
              WHEN ${issueHistograms.date} >= CURRENT_DATE - INTERVAL '7 days'
              THEN ${issueHistograms.count}
              ELSE 0
            END
          ), 0)
        `.as('last7DaysCount'),
        lastSeenDate: sql<Date>`MAX(${issueHistograms.date})`.as(
          'lastSeenDate',
        ),
        escalatingCount: sql<number>`
          COALESCE(SUM(
            CASE
              WHEN ${issueHistograms.date} >= CURRENT_DATE - INTERVAL '2 days'
              THEN ${issueHistograms.count}
              ELSE 0
            END
          ), 0)
        `.as('escalatingCount'),
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
