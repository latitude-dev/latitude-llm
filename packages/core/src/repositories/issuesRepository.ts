import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import { issueHistograms } from '../schema/models/issueHistograms'
import { type Issue } from '../schema/models/types/Issue'
import { issues } from '../schema/models/issues'
import { Result } from '../lib/Result'
import RepositoryLegacy from './repository'
import { IssueHistogramsRepository } from './issueHistogramsRepository'
import { Commit } from '../schema/models/types/Commit'
import { CommitsRepository } from './commitsRepository'
import { HEAD_COMMIT } from '@latitude-data/constants'

const tt = getTableColumns(issues)

export type IssueFilter = {
  ignored?: boolean
  resolved?: boolean
  escalating?: boolean
  new?: boolean
}

export type IssueSort = 'relevance' | 'lastSeen' | 'firstSeen' | 'title'

export type IssuesQueryOptions = {
  projectId?: number
  commitUuid?: string
  filters?: IssueFilter
  sort?: IssueSort
  cursor?: string
  limit?: number
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
    projectId,
    commitUuid,
    filters = {},
    sort = 'relevance',
    cursor,
    limit = 20,
  }: IssuesQueryOptions) {
    const whereConditions = [
      eq(issues.workspaceId, this.workspaceId),
      projectId ? eq(issues.projectId, projectId) : undefined,
    ].filter(Boolean)

    const havingConditions = []

    // Apply filters
    if (filters.ignored !== undefined) {
      havingConditions.push(
        filters.ignored
          ? sql`${issues.ignoredAt} IS NOT NULL`
          : sql`${issues.ignoredAt} IS NULL`,
      )
    }

    if (filters.resolved !== undefined) {
      havingConditions.push(
        filters.resolved
          ? sql`${issues.resolvedAt} IS NOT NULL`
          : sql`${issues.resolvedAt} IS NULL`,
      )
    }

    if (filters.escalating) {
      havingConditions.push(sql`escalating_count > 0`)
    }

    if (filters.new) {
      havingConditions.push(sql`is_new = true`)
    }

    // Apply cursor pagination
    if (cursor) {
      const cursorId = this.parseCursor(cursor)
      if (cursorId) {
        whereConditions.push(sql`${issues.id} < ${cursorId}`)
      }
    }

    // Build order by clause
    let orderByClause
    switch (sort) {
      case 'relevance':
        orderByClause = [desc(sql`last7DaysCount`), desc(sql`lastSeenDate`)]
        break
      case 'lastSeen':
        orderByClause = [desc(sql`lastSeenDate`)]
        break
      case 'firstSeen':
        orderByClause = [desc(issues.createdAt)]
        break
      case 'title':
        orderByClause = [issues.title]
        break
      default:
        orderByClause = [desc(sql`last7DaysCount`), desc(sql`lastSeenDate`)]
    }

    // Get relevant commits first
    const commitsResult = await this.getCommits({
      projectId,
      commitUuid,
    })
    if (commitsResult.error) return commitsResult

    const commitIds = commitsResult.value.map(c => c.id)

    if (commitIds.length === 0) {
      return Result.ok({
        issues: [],
        hasMore: false,
        nextCursor: null,
      })
    }

    // Get histogram stats subquery
    const histogramRepo = new IssueHistogramsRepository(
      this.workspaceId,
      this.db,
    )
    const histogramStats =
      histogramRepo.getHistogramStatsSubquery(relevantCommitIds)

    // Execute the main query with histogram stats
    const results = await this.db
      .select({
        ...tt,
        last7DaysCount: sql<number>`COALESCE(${histogramStats.last7DaysCount}, 0)`,
        lastSeenDate: histogramStats.lastSeenDate,
        escalatingCount: sql<number>`COALESCE(${histogramStats.escalatingCount}, 0)`,
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
      .leftJoin(histogramStats, eq(histogramStats.issueId, issues.id))
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

  private async getRelevantCommits({
    projectId,
    commitUuid,
  }: {
    projectId?: number
    commitUuid?: string
  }) {
    const histogramsRepo = new IssueHistogramsRepository(
      this.workspaceId,
      this.db,
    )

    if (commitUuid) {
      // Get commit and all its ancestors
      const commitsResult = await histogramsRepo.getCommitsByUuid({
        commitUuid,
        projectId,
      })
      if (commitsResult.error) return commitsResult

      return Result.ok(commitsResult.value)
    } else if (projectId) {
      // Get all commit IDs from histograms for the project
      const result = await this.db
        .selectDistinct({ commitId: issueHistograms.commitId })
        .from(issueHistograms)
        .innerJoin(issues, eq(issues.id, issueHistograms.issueId))
        .where(
          and(
            eq(issueHistograms.workspaceId, this.workspaceId),
            eq(issues.projectId, projectId),
          ),
        )

      return Result.ok(result.map((r: { commitId: number }) => r.commitId))
    }

    return Result.ok([])
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

  async getCommits({
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
}
