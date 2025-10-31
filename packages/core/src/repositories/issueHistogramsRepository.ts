import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import Repository from './repositoryV2'
import { issueHistograms } from '../schema/models/issueHistograms'
import {
  ESCALATING_DAYS,
  RECENT_ISSUES_DAYS,
  HISTOGRAM_SUBQUERY_ALIAS,
} from '@latitude-data/constants/issues'
import { format } from 'date-fns'
import { Commit } from '../schema/models/types/Commit'
import { IssueHistogram } from '../schema/models/types/IssueHistogram'

const tt = getTableColumns(issueHistograms)

export class IssueHistogramsRepository extends Repository<IssueHistogram> {
  get scopeFilter() {
    return eq(issueHistograms.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(issueHistograms)
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findHistogram({
    commit,
    issue,
    date,
  }: {
    issue: Issue
    commit: Commit
    date: Date
  }) {
    const histogram = await this.db
      .select()
      .from(issueHistograms)
      .where(
        and(
          eq(issueHistograms.workspaceId, this.workspaceId),
          eq(issueHistograms.commitId, commit.id),
          eq(issueHistograms.issueId, issue.id),
          eq(issueHistograms.date, format(date, 'yyyy-MM-dd')),
        ),
      )
      .limit(1)

    return histogram[0] || null
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
