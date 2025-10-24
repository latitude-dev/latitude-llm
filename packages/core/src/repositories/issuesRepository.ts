import { and, desc, eq, getTableColumns, or, sql } from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import { type Project } from '../schema/models/types/Project'
import { type Commit } from '../schema/models/types/Commit'
import { issues } from '../schema/models/issues'
import { Result } from '../lib/Result'
import RepositoryLegacy from './repository'
import { IssueHistogramsRepository } from './issueHistogramsRepository'
import { CommitsRepository } from './commitsRepository'
import { IssueStatus } from '@latitude-data/constants/issues'

const tt = getTableColumns(issues)

export type IssueSort = 'relevance' | 'lastSeen' | 'firstSeen' | 'title'

export type IssueFilters = {
  statuses?: IssueStatus[]
  // Future filters will be added here (dates, etc.)
}

export class IssuesRepository extends RepositoryLegacy<typeof tt, Issue> {
  get scope() {
    return this.db
      .select(tt)
      .from(issues)
      .where(eq(issues.workspaceId, this.workspaceId))
      .as('issuesScope')
  }

  async filterIssues({
    project,
    commit,
    filters = {},
    sort = 'relevance',
    cursor,
    limit = 20,
  }: {
    project: Project
    commit: Commit
    filters?: IssueFilters
    sort?: IssueSort
    cursor?: string
    limit?: number
  }) {
    // Get commit IDs from the provided commit and its history
    const commitIdsResult = await this.getCommitIds({ commit })
    if (commitIdsResult.error) return commitIdsResult

    const commitIds = commitIdsResult.value

    const whereConditions = this.buildWhereConditions({ project, cursor })
    const havingConditions = this.buildHavingConditions({ filters })
    const orderByClause = this.buildOrderByClause(sort)

    const histogramRepo = new IssueHistogramsRepository(
      this.workspaceId,
      this.db,
    )
    const histogramStatsSubquery = histogramRepo.getHistogramStatsSubquery({
      commitIds,
    })

    // Execute the main query with histogram stats
    const results = await this.db
      .select({
        ...tt,
        last7DaysCount: sql<number>`COALESCE(${histogramStatsSubquery.last7DaysCount}, 0)`,
        lastSeenDate: histogramStatsSubquery.lastSeenDate,
        escalatingCount: sql<number>`COALESCE(${histogramStatsSubquery.escalatingCount}, 0)`,
        isNew: sql<boolean>`
          CASE
            WHEN ${issues.createdAt} >= CURRENT_DATE - INTERVAL '7 days'
            THEN true
            ELSE false
          END
        `.as('isNew'),
        isResolved: sql<boolean>`
          CASE
            WHEN ${issues.resolvedAt} IS NOT NULL
            THEN true
            ELSE false
          END
        `.as('isResolved'),
        isIgnored: sql<boolean>`
          CASE
            WHEN ${issues.ignoredAt} IS NOT NULL
            THEN true
            ELSE false
          END
        `.as('isIgnored'),
      })
      .from(issues)
      .leftJoin(
        histogramStatsSubquery,
        eq(histogramStatsSubquery.issueId, issues.id),
      )
      .where(and(...whereConditions))
      .having(
        havingConditions.length > 0 ? and(...havingConditions) : undefined,
      )
      .orderBy(...orderByClause)
      .limit(limit + 1)

    const hasMore = results.length > limit
    const issueResults = hasMore ? results.slice(0, -1) : results

    // Generate next cursor
    const nextCursor =
      hasMore && issueResults.length > 0
        ? this.generateCursor(issueResults[issueResults.length - 1]!)
        : null

    return Result.ok({
      issues: issueResults,
      hasMore,
      nextCursor,
    })
  }

  private buildWhereConditions({
    project,
    cursor,
  }: {
    project: Project
    cursor?: string
  }) {
    const conditions = [
      eq(issues.workspaceId, this.workspaceId),
      eq(issues.projectId, project.id),
    ]

    if (cursor) {
      const cursorId = this.parseCursor(cursor)
      if (cursorId) {
        conditions.push(sql`${issues.id} < ${cursorId}`)
      }
    }

    return conditions
  }

  private buildHavingConditions({ filters }: { filters: IssueFilters }) {
    const conditions = []

    if (filters.statuses && filters.statuses.length > 0) {
      const statusConditions = filters.statuses.map((status) => {
        switch (status) {
          case 'new':
            return sql`is_new = true`
          case 'escalating':
            return sql`escalating_count > 0`
          case 'resolved':
            return sql`${issues.resolvedAt} IS NOT NULL`
          case 'ignored':
            return sql`${issues.ignoredAt} IS NOT NULL`
          default:
            return sql`1 = 0` // Never matches
        }
      })

      conditions.push(or(...statusConditions)!)
    }

    return conditions
  }

  private buildOrderByClause(sort: IssueSort) {
    switch (sort) {
      case 'relevance':
        return [desc(sql`last7DaysCount`), desc(sql`lastSeenDate`)]
      case 'lastSeen':
        return [desc(sql`lastSeenDate`)]
      case 'firstSeen':
        return [desc(issues.createdAt)]
      case 'title':
        return [issues.title]
      default:
        return [desc(sql`last7DaysCount`), desc(sql`lastSeenDate`)]
    }
  }

  private async getCommitIds({ commit }: { commit: Commit }) {
    const commitsRepo = new CommitsRepository(this.workspaceId, this.db)
    const commits = await commitsRepo.getCommitsHistory({ commit })
    return Result.ok(commits.map((c: { id: number }) => c.id))
  }

  private parseCursor(cursor: string): number | null {
    try {
      return parseInt(cursor, 10)
    } catch {
      return null
    }
  }

  private generateCursor(issue: Issue): string {
    return issue.id.toString()
  }
}
