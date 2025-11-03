import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  isNull,
  like,
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
import {
  SafeIssuesParams,
  IssueSort,
  ESCALATING_COUNT_THRESHOLD,
  HISTOGRAM_SUBQUERY_ALIAS,
} from '@latitude-data/constants/issues'

const tt = getTableColumns(issues)

type IssueFilters = SafeIssuesParams['filters']
type Sorting = SafeIssuesParams['sorting']

type FilteringArguments = {
  project: Project
  commit: Commit
  filters: IssueFilters
  sorting: Sorting
  page: number
  limit: number
}

export class IssuesRepository extends Repository<Issue> {
  get scopeFilter() {
    return eq(issues.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db.select(tt).from(issues).where(this.scopeFilter).$dynamic()
  }

  /**
   * Offset-based pagination for issues with filtering and sorting.
   */
  async fetchIssuesFiltered({
    project,
    commit,
    filters,
    sorting: { sort, sortDirection },
    page,
    limit,
  }: FilteringArguments) {
    const offset = (page - 1) * limit
    const whereConditions = this.buildWhereConditions({ project, filters })
    const orderByClause = this.buildOrderByClause({
      sort,
      sortDirection,
    })
    const results = await this.fetchIssues({
      commit,
      filters,
      where: whereConditions,
      orderBy: orderByClause,
      limit,
      offset,
    })
    const totalResult = await this.fetchIssuesCount({
      project,
      commit,
      filters,
    })
    const totalCount = totalResult.unwrap()

    return Result.ok({
      issues: results,
      page,
      limit,
      totalCount,
    })
  }

  private async fetchIssues({
    commit,
    where,
    filters,
    orderBy,
    limit,
    offset,
  }: {
    commit: Commit
    filters: IssueFilters
    where: SQL[]
    orderBy: SQL[]
    limit: number
    offset: number
  }) {
    const commitIds = await this.getCommitIds({ commit })
    const subquery = this.buildHistogramSubquery({ commitIds, filters })
    // Make listing lighter by excluding description field
    const { description: _, ...issueColumns } = tt

    const query = this.db
      .select({
        ...issueColumns,
        recentCount: subquery.recentCount,
        totalCount: subquery.totalCount,
        firstSeenDate: subquery.firstSeenDate,
        lastSeenDate: subquery.lastSeenDate,
        escalatingCount: subquery.escalatingCount,
        isNew:
          sql<boolean>`(${issues.createdAt} >= NOW() - INTERVAL '7 days')`.as(
            'isNew',
          ),
        isResolved: sql<boolean>`(${issues.resolvedAt} IS NOT NULL)`.as(
          'isResolved',
        ),
        isEscalating: sql<boolean>`(
          CASE
            WHEN ${subquery.escalatingCount} > ${ESCALATING_COUNT_THRESHOLD}
            THEN true
            ELSE false
          END
        )`.as('isEscalating'),
        isIgnored: sql<boolean>`(${issues.ignoredAt} IS NOT NULL)`.as(
          'isIgnored',
        ),
      })
      .from(issues)
      .innerJoin(subquery, eq(subquery.issueId, issues.id))
      .where(and(...where))
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)

    return await query
  }

  /**
   * Get total count of filtered issues.
   * Used for calculating total pages for offset pagination.
   */
  private async fetchIssuesCount({
    project,
    commit,
    filters,
  }: Omit<FilteringArguments, 'page' | 'limit' | 'sorting'>) {
    const whereConditions = this.buildWhereConditions({ project, filters })
    const commitIds = await this.getCommitIds({ commit })
    const subquery = this.buildHistogramSubquery({ commitIds, filters })

    const innerQuery = this.db
      .select({ issueId: issues.id })
      .from(issues)
      .innerJoin(subquery, eq(subquery.issueId, issues.id))
      .where(and(...whereConditions))
      .as('filteredIssues')

    const query = this.db
      .select({ count: sql<number>`COUNT(*)::integer` })
      .from(innerQuery)

    const result = await query
    return Result.ok(result[0]?.count ?? 0)
  }

  private buildHistogramSubquery({
    commitIds,
    filters,
  }: {
    commitIds: number[]
    filters: IssueFilters
  }) {
    const histogramRepo = new IssueHistogramsRepository(
      this.workspaceId,
      this.db,
    )
    return histogramRepo.getHistogramStatsSubquery({
      commitIds,
      filters,
    })
  }

  private buildWhereConditions({
    project,
    filters,
  }: {
    project: Project
    filters: IssueFilters
  }) {
    const conditions: SQL[] = [
      this.scopeFilter,
      eq(issues.projectId, project.id),
    ]

    // Use documentUuid filter if provided, otherwise use commit.mainDocumentUuid as default
    if (filters.documentUuid) {
      conditions.push(eq(issues.documentUuid, filters.documentUuid))
    }

    if (filters.query && filters.query.trim().length > 0) {
      conditions.push(like(issues.title, `%${filters.query}%`))
    }

    // Handle status filtering based on new tab system
    const status = filters.status || 'active' // Default to active

    switch (status) {
      case 'active':
        // Active: not resolved and not ignored
        conditions.push(isNull(issues.resolvedAt))
        conditions.push(isNull(issues.ignoredAt))
        break
      case 'archived':
        // Archived: resolved or ignored
        conditions.push(
          or(
            sql`${issues.resolvedAt} IS NOT NULL`,
            sql`${issues.ignoredAt} IS NOT NULL`,
          )!,
        )
        break
      case 'regressed':
        // Regressed: resolved but with histogram data after resolved date
        // This will be handled in HAVING clause since it requires histogram data
        conditions.push(
          ...[
            sql`${issues.resolvedAt} IS NOT NULL`,
            isNull(issues.ignoredAt),
            sql`${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} > ${issues.resolvedAt}`,
          ],
        )
        break
    }

    return conditions
  }

  private buildOrderByClause({
    sortDirection,
  }: {
    sort: IssueSort
    sortDirection: Sorting['sortDirection']
  }) {
    const dir = sortDirection === 'asc' ? asc : desc
    return [
      dir(sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."recentCount"`)),
      dir(sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)),
      dir(issues.id),
    ]
  }

  private async getCommitIds({ commit }: { commit: Commit }) {
    const commitsRepo = new CommitsRepository(this.workspaceId, this.db)
    const commits = await commitsRepo.getCommitsHistory({ commit })
    const commitIds = commits.map((c: { id: number }) => c.id)
    return commitIds
  }
}
