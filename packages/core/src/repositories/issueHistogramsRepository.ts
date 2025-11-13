import {
  ESCALATING_DAYS,
  HISTOGRAM_SUBQUERY_ALIAS,
  MINI_HISTOGRAM_STATS_DAYS,
  RECENT_ISSUES_DAYS,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'
import { endOfDay, format, startOfDay, subDays } from 'date-fns'
import { and, eq, getTableColumns, gte, inArray, SQL, sql } from 'drizzle-orm'
import { Result } from '../lib/Result'
import { issueHistograms } from '../schema/models/issueHistograms'
import { Commit } from '../schema/models/types/Commit'
import { type Issue } from '../schema/models/types/Issue'
import { IssueHistogram } from '../schema/models/types/IssueHistogram'
import { Project } from '../schema/models/types/Project'
import { CommitsRepository } from './commitsRepository'
import Repository from './repositoryV2'

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

  async hasOccurrences({ issueId }: { issueId: number }) {
    const result = await this.db
      .select({ exists: sql<boolean>`TRUE` })
      .from(issueHistograms)
      .where(and(this.scopeFilter, eq(issueHistograms.issueId, issueId)))
      .limit(1)
      .then((r) => r[0])

    return Result.ok<boolean>(!!result?.exists)
  }

  getHistogramStatsForIssue({
    project,
    issueId,
  }: {
    project: Project
    issueId: number
  }) {
    return this.db
      .select(this.histogramStatsSelect)
      .from(issueHistograms)
      .where(
        and(
          this.scopeFilter,
          eq(issueHistograms.projectId, project.id),
          eq(issueHistograms.issueId, issueId),
        ),
      )
      .groupBy(issueHistograms.issueId)
      .as(HISTOGRAM_SUBQUERY_ALIAS)
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
      .select(this.histogramStatsSelect)
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

  /**
   * Find histogram data for a single issue for the last N days
   */
  async findHistogramForIssue({
    issueId,
    commitUuid,
    projectId,
    days,
  }: {
    issueId: number
    commitUuid: string
    projectId: number
    days?: number
  }) {
    const commitIds = await this.getCommitIds({ commitUuid, projectId })

    const results = await this.fetchHistogramData({
      issueIds: [issueId],
      commitIds,
      projectId,
      days,
    })

    // Extract data for single issue (no issueId grouping needed)
    const dateCounts = results.map((r) => ({
      date: r.date,
      count: r.count,
    }))

    return this.fillMissingDays({ data: dateCounts, days })
  }

  /**
   * Find histogram data for multiple issues for the last N days
   */

  async findHistogramsForIssues({
    issueIds,
    commitUuid,
    projectId,
    days,
  }: {
    issueIds: number[]
    commitUuid: string
    projectId: number
    days?: number
  }) {
    if (issueIds.length === 0) return { statsTotalCount: 0, issues: [] }

    const commitIds = await this.getCommitIds({ commitUuid, projectId })
    const results = await this.fetchHistogramData({
      issueIds,
      commitIds,
      projectId,
      days,
    })

    // Group by issueId
    const issueDateMap = new Map<number, Map<string, number>>()
    results.forEach((r) => {
      if (!issueDateMap.has(r.issueId)) {
        issueDateMap.set(r.issueId, new Map())
      }
      issueDateMap.get(r.issueId)!.set(r.date, r.count)
    })

    // Fill missing days with 0 count for each issue
    const issues = issueIds.map((issueId) => {
      const dateMap = issueDateMap.get(issueId) ?? new Map()
      const dateCounts = Array.from(dateMap.entries()).map(([date, count]) => ({
        date,
        count,
      }))
      const { data, totalCount } = this.fillMissingDays({
        data: dateCounts,
        days,
      })
      return { issueId, data, totalCount }
    })

    const statsTotalCount = issues.reduce((acc, i) => acc + i.totalCount, 0)

    return { statsTotalCount, issues }
  }

  /**
   * Fill missing days with 0 count for a single issue and calculate totalCount
   */
  private fillMissingDays({
    data,
    days = MINI_HISTOGRAM_STATS_DAYS,
  }: {
    data: Array<{ date: string; count: number }>
    days?: number
  }): { data: Array<{ date: string; count: number }>; totalCount: number } {
    const dateMap = new Map<string, number>()
    let totalCount = 0
    data.forEach((r) => {
      const count = Number(r.count)
      dateMap.set(r.date, count)
      totalCount += count
    })

    const filledResults: Array<{ date: string; count: number }> = []
    const today = new Date()
    for (let i = 0; i < days; i++) {
      const date = subDays(today, days - 1 - i)
      const dateStr = format(date, 'yyyy-MM-dd')
      const count = dateMap.get(dateStr) ?? 0
      filledResults.push({
        date: dateStr,
        count,
      })
    }

    const groupedResults = this.groupDaysForDisplay(filledResults, days)

    return { data: groupedResults, totalCount }
  }

  /**
   * Group days into buckets to maintain consistent bar count (~30 bars)
   * For 90 days, groups into ~3-day buckets
   */
  private groupDaysForDisplay(
    data: Array<{ date: string; count: number }>,
    totalDays: number,
  ): Array<{ date: string; count: number }> {
    const targetBars = 30
    const daysPerBar = Math.max(1, Math.ceil(totalDays / targetBars))

    if (daysPerBar === 1) {
      return data
    }

    const grouped: Array<{ date: string; count: number }> = []
    for (let i = 0; i < data.length; i += daysPerBar) {
      const chunk = data.slice(i, i + daysPerBar)
      // Ensure we're adding numbers, not concatenating strings
      const totalCount = chunk.reduce(
        (sum, item) => sum + Number(item.count),
        0,
      )
      grouped.push({
        date: chunk[0].date,
        count: totalCount,
      })
    }

    return grouped
  }

  /**
   * Shared query logic for fetching histogram data
   */
  private async fetchHistogramData({
    issueIds,
    commitIds,
    projectId,
    days = MINI_HISTOGRAM_STATS_DAYS,
  }: {
    issueIds: number[]
    commitIds: number[]
    projectId: number
    days?: number
  }) {
    if (issueIds.length === 0) return []

    const startDate = subDays(new Date(), days)
    const formattedStartDate = format(startDate, 'yyyy-MM-dd')

    const whereConditions: SQL[] = [
      this.scopeFilter,
      eq(issueHistograms.projectId, projectId),
      inArray(issueHistograms.issueId, issueIds),
      inArray(issueHistograms.commitId, commitIds),
      gte(issueHistograms.date, sql`${formattedStartDate}::date`),
    ]

    const results = await this.db
      .select({
        issueId: issueHistograms.issueId,
        date: issueHistograms.date,
        count: sql<number>`COALESCE(SUM(${issueHistograms.count}), 0)`.as(
          'count',
        ),
      })
      .from(issueHistograms)
      .where(and(...whereConditions))
      .groupBy(issueHistograms.issueId, issueHistograms.date)
      .orderBy(issueHistograms.issueId, issueHistograms.date)

    return results
  }

  /**
   * Get commit IDs from commit history (same pattern as IssuesRepository)
   */
  private async getCommitIds({
    commitUuid,
    projectId,
  }: {
    commitUuid: string
    projectId: number
  }) {
    const commitsRepo = new CommitsRepository(this.workspaceId, this.db)
    const commit = await commitsRepo
      .getCommitByUuid({
        projectId,
        uuid: commitUuid,
      })
      .then((r) => r.unwrap())

    const commits = await commitsRepo.getCommitsHistory({ commit })
    const commitIds = commits.map((c: { id: number }) => c.id)
    return commitIds
  }

  private get histogramStatsSelect() {
    return {
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
      lastSeenDate: sql<Date>`MAX(${issueHistograms.date})`.as('lastSeenDate'),
      firstOccurredAt: sql<Date>`MIN(${issueHistograms.occurredAt})`.as(
        'firstOccurredAt',
      ),
      lastOccurredAt: sql<Date>`MAX(${issueHistograms.occurredAt})`.as(
        'lastOccurredAt',
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
    }
  }
}
