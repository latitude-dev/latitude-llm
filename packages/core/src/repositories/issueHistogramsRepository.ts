import { and, eq, getTableColumns, inArray, SQL, sql } from 'drizzle-orm'
import { endOfDay, format, startOfDay } from 'date-fns'
import { type Issue } from '../schema/models/types/Issue'
import Repository from './repositoryV2'
import { issueHistograms } from '../schema/models/issueHistograms'
import {
  ESCALATING_DAYS,
  RECENT_ISSUES_DAYS,
  HISTOGRAM_SUBQUERY_ALIAS,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'
import { Commit } from '../schema/models/types/Commit'
import { IssueHistogram } from '../schema/models/types/IssueHistogram'
import { Project } from '../schema/models/types/Project'

const tt = getTableColumns(issueHistograms)
type IssueFilters = SafeIssuesParams['filters']

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
  getHistogramStatsSubquery({
    project,
    commitIds,
    filters,
  }: {
    project: Project
    commitIds: number[]
    filters: IssueFilters
  }) {
    const havingConditions = this.buildHavingConditions({ filters })
    const whereConditions: SQL[] = [
      this.scopeFilter,
      eq(issueHistograms.projectId, project.id),
      inArray(issueHistograms.commitId, commitIds),
    ]

    if (filters.documentUuid) {
      whereConditions.push(
        eq(issueHistograms.documentUuid, filters.documentUuid),
      )
    }

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
      .where(and(...whereConditions))
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
