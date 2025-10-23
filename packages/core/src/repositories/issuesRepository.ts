import { and, desc, eq, getTableColumns, or, sql } from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import { issues } from '../schema/models/issues'
import { Result } from '../lib/Result'
import RepositoryLegacy from './repository'
import { IssueHistogramsRepository } from './issueHistogramsRepository'
import { CommitsRepository } from './commitsRepository'
import { HEAD_COMMIT } from '@latitude-data/constants'
import { IssueStatus } from '@latitude-data/constants/issues'

const tt = getTableColumns(issues)

export type IssueSort = 'relevance' | 'lastSeen' | 'firstSeen' | 'title'
const EMPTY_STATUSES: IssueStatus[] = []

export class IssuesRepository extends RepositoryLegacy<typeof tt, Issue> {
  get scope() {
    return this.db
      .select(tt)
      .from(issues)
      .where(eq(issues.workspaceId, this.workspaceId))
      .as('issuesScope')
  }

  async filterIssues({
    projectId,
    commitUuid,
    statuses = EMPTY_STATUSES,
    sort = 'relevance',
    cursor,
    limit = 20,
  }: {
    projectId?: number
    commitUuid?: string
    statuses?: IssueStatus[]
    sort?: IssueSort
    cursor?: string
    limit?: number
  }) {
    const commitsResult = await this.getCommits({ projectId, commitUuid })
    if (commitsResult.error) return commitsResult

    const commitIds = commitsResult.value.map((c) => c.id)

    if (commitIds.length === 0) {
      // Early return if no commits
      return Result.ok({
        issues: [],
        hasMore: false,
        nextCursor: null,
      })
    }

    const whereConditions = this.buildWhereConditions({ projectId, cursor })
    const havingConditions = this.buildHavingConditions({ statuses })
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
    projectId,
    cursor,
  }: {
    projectId?: number
    cursor?: string
  }) {
    const conditions = [
      eq(issues.workspaceId, this.workspaceId),
      projectId ? eq(issues.projectId, projectId) : undefined,
    ].filter(Boolean)

    if (cursor) {
      const cursorId = this.parseCursor(cursor)
      if (cursorId) {
        conditions.push(sql`${issues.id} < ${cursorId}`)
      }
    }

    return conditions
  }

  private buildHavingConditions({ statuses }: { statuses?: IssueStatus[] }) {
    const conditions = []

    if (statuses && statuses.length > 0) {
      const statusConditions = statuses.map((status) => {
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

  /**
   * Read `getCommitsHistory` docs for more info
   */
  private async getCommits({
    commitUuid,
    projectId,
  }: {
    commitUuid?: string
    projectId?: number
  }) {
    const repo = new CommitsRepository(this.workspaceId, this.db)
    const commitResult = await this.getCommit({
      commitUuid: commitUuid ?? HEAD_COMMIT,
      projectId,
    })
    if (commitResult.error) return commitResult

    return Result.ok(
      await repo.getCommitsHistory({ commit: commitResult.value }),
    )
  }

  private async getCommit({
    commitUuid,
    projectId,
  }: {
    commitUuid: string
    projectId?: number
  }) {
    const commitsScope = new CommitsRepository(this.workspaceId, this.db)
    const commitResult = await commitsScope.getCommitByUuid({
      projectId,
      uuid: commitUuid,
    })
    if (commitResult.error) return commitResult

    return Result.ok(commitResult.unwrap())
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
