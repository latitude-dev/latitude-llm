import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  lte,
  or,
  sql,
  SQL,
} from 'drizzle-orm'
import { type Issue } from '../schema/models/types/Issue'
import { type Project } from '../schema/models/types/Project'
import { type Commit } from '../schema/models/types/Commit'
import { issues } from '../schema/models/issues'
import { Result } from '../lib/Result'
import Repository from './repositoryV2'
import { IssueHistogramsRepository } from './issueHistogramsRepository'
import { CommitsRepository } from './commitsRepository'
import { SafeIssuesParams, IssueSort } from '@latitude-data/constants/issues'
import { IssuesCusrorBuilder } from '../data-access/issues/CursorBuilder'

const tt = getTableColumns(issues)

type IssueFilters = SafeIssuesParams['filters']
type Sorting = SafeIssuesParams['sorting']

export class IssuesRepository extends Repository<Issue> {
  get scopeFilter() {
    return eq(issues.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db.select(tt).from(issues).where(this.scopeFilter).$dynamic()
  }

  /**
   * Cursor based pagination for issues with filtering and sorting.
   */
  async fetchIssuesFiltered({
    project,
    commit,
    cursor,
    filters = {},
    sorting: { sort, sortDirection: originalSortDirection, direction },
    limit = 20,
  }: {
    project: Project
    commit: Commit
    filters: IssueFilters
    sorting: Sorting
    cursor?: string
    limit?: number
  }) {
    // 1. Prepare query components
    const sortDirection = this.getDirection({
      direction,
      sortDirection: originalSortDirection,
    })
    const cursorHelper = new IssuesCusrorBuilder({
      sort,
      sortDirection,
      cursor,
    })
    const whereConditions = this.buildWhereConditions({
      project,
      filters,
      cursor: cursorHelper,
    })

    // If fetching backwards, flip the sort direction
    const havingConditions = this.buildHavingConditions({ filters })
    const orderByClause = this.buildOrderByClause({
      sort,
      sortDirection,
    })

    // 2. Execute the query
    const results = await this.fetchIssues({
      commit,
      where: whereConditions,
      having: havingConditions,
      orderBy: orderByClause,
      limit: limit + 1, // 1 is next cursor check
    })

    // 3. Process results for pagination
    return Result.ok({
      issues: results.slice(0, limit),
      ...cursorHelper.buildCursors({ results, limit })
    })
  }

  private async fetchIssues({
    commit,
    where,
    having,
    orderBy,
    limit,
  }: {
    commit: Commit
    where: SQL[]
    having: SQL[]
    orderBy: SQL[]
    limit: number
  }) {
    const commitIds = await this.getCommitIds({ commit })
    const subquery = this.buildHistogramSubquery({ commitIds })
    return this.db
      .select({
        ...tt,
        last7DaysCount: sql<number>`COALESCE(${subquery.last7DaysCount}, 0)`,
        lastSeenDate: subquery.lastSeenDate,
        escalatingCount: sql<number>`COALESCE(${subquery.escalatingCount}, 0)`,
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
      .leftJoin(subquery, eq(subquery.issueId, issues.id))
      .where(and(...where))
      .having(having.length > 0 ? and(...having) : undefined)
      .orderBy(...orderBy)
      .limit(limit + 1)
  }

  private buildHistogramSubquery({ commitIds }: { commitIds: number[] }) {
    const histogramRepo = new IssueHistogramsRepository(
      this.workspaceId,
      this.db,
    )
    return histogramRepo.getHistogramStatsSubquery({
      commitIds,
    })
  }

  private buildWhereConditions({
    project,
    filters,
    cursor,
  }: {
    project: Project
    filters: IssueFilters
    cursor: IssuesCusrorBuilder
  }) {
    const conditions: SQL[] = [
      this.scopeFilter,
      eq(issues.projectId, project.id),
    ]

    if (filters.documentUuid) {
      conditions.push(eq(issues.documentUuid, filters.documentUuid))
    }

    if (filters.query && filters.query.trim().length > 0) {
      conditions.push(sql`${issues.title} % ${filters.query}`)
    }

    const cursorCondition = cursor.whereCondition

    if (cursorCondition) {
      conditions.push(cursorCondition)
    }

    return conditions
  }

  private buildHavingConditions({ filters }: { filters: IssueFilters }) {
    const conditions: SQL[] = []

    if (filters.statuses && filters.statuses.length > 0) {
      const statuses = filters.statuses.map((status) => {
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

      const contidtion = or(...statuses)
      if (contidtion) conditions.push()
    }

    if (filters.firstSeen) {
      const condition = and(
        gte(issues.createdAt, filters.firstSeen.from),
        lte(issues.createdAt, filters.firstSeen.to),
      )
      if (condition) conditions.push(condition)
    }

    if (filters.lastSeen) {
      const condition = and(
        gte(sql`lastSeenDate`, filters.lastSeen.from),
        lte(sql`lastSeenDate`, filters.lastSeen.to),
      )
      if (condition) conditions.push(condition)
    }

    return conditions
  }

  private buildOrderByClause({
    sort,
    sortDirection,
  }: {
    sort: IssueSort
    sortDirection: Sorting['sortDirection']
  }) {
    const dir = sortDirection === 'asc' ? asc : desc

    switch (sort) {
      case 'relevance':
        return [dir(sql`last7DaysCount`), dir(sql`lastSeenDate`)]

      case 'lastSeen':
        return [dir(sql`lastSeenDate`)]

      case 'firstSeen':
        return [dir(issues.createdAt)]

      default:
        return [dir(sql`last7DaysCount`), dir(sql`lastSeenDate`)]
    }
  }

  /**
   * Determine the effective sort direction based on the query direction.
   * This is here for when user click previous/next buttons to
   * fetch data in different directions.
   */
  private getDirection({
    direction,
    sortDirection,
  }: {
    direction: Sorting['direction']
    sortDirection: Sorting['sortDirection']
  }) {
    if (direction === 'backward') {
      return sortDirection === 'asc' ? 'desc' : 'asc'
    }
    return sortDirection
  }

  private async getCommitIds({ commit }: { commit: Commit }) {
    const commitsRepo = new CommitsRepository(this.workspaceId, this.db)
    const commits = await commitsRepo.getCommitsHistory({ commit })
    return commits.map((c: { id: number }) => c.id)
  }
}
