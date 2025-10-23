import { and, eq, getTableColumns, inArray, SQL, sql } from 'drizzle-orm'
import { endOfDay, startOfDay } from 'date-fns'
import { type Issue } from '../schema/models/types/Issue'
import RepositoryLegacy from './repository'
import { issueHistograms } from '../schema/models/issueHistograms'
import {
  ESCALATING_DAYS,
  RECENT_ISSUES_DAYS,
  HISTOGRAM_SUBQUERY_ALIAS,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'

const tt = getTableColumns(issueHistograms)
type IssueFilters = SafeIssuesParams['filters']

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
  getHistogramStatsSubquery({
    commitIds,
    filters,
  }: {
    commitIds: number[]
    filters: IssueFilters
  }) {
    const havingConditions = this.buildHavingConditions({ filters })
    const baseQuery = this.db
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

    if (havingConditions.length === 0) {
      return baseQuery.as(HISTOGRAM_SUBQUERY_ALIAS)
    }

    return baseQuery
      .having(and(...havingConditions))
      .as(HISTOGRAM_SUBQUERY_ALIAS)
  }

  private buildHavingConditions({ filters }: { filters: IssueFilters }) {
    const conditions: SQL[] = []

    if (filters.firstSeen) {
      const fromStartOfDay = startOfDay(filters.firstSeen)
      // Use actual aggregate expression, not the alias
      conditions.push(sql`MIN(${issueHistograms.date}) >= ${fromStartOfDay}`)
    }

    if (filters.lastSeen) {
      const toEndOfDay = endOfDay(filters.lastSeen)
      // Use actual aggregate expression, not the alias
      conditions.push(sql`MAX(${issueHistograms.date}) <= ${toEndOfDay}`)
    }

    return conditions
  }
}
