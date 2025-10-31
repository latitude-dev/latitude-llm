import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  isNull,
  like,
  or,
  sql,
  SQL,
} from 'drizzle-orm'
import { endOfDay } from 'date-fns'
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
import { DocumentVersion } from '../schema/models/types/DocumentVersion'

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

  async findById({ project, issueId }: { project: Project; issueId: number }) {
    const result = await this.db
      .select()
      .from(issues)
      .where(
        and(
          this.scopeFilter,
          eq(issues.projectId, project.id),
          eq(issues.id, issueId),
        ),
      )
      .limit(1)
    return result[0] || null
  }

  async findByTitle({
    project,
    document,
    title,
  }: {
    project: Project
    document: DocumentVersion
    title: string | null
  }) {
    return this.db
      .select({
        id: issues.id,
        title: issues.title,
      })
      .from(issues)
      .where(
        and(
          this.scopeFilter,
          eq(issues.projectId, project.id),
          eq(issues.documentUuid, document.documentUuid),
          like(issues.title, `%${title ?? ''}%`),
        ),
      )
      .orderBy(desc(issues.createdAt))
      .limit(20)
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
    const havingConditions = this.buildHavingConditions({ filters })
    const orderByClause = this.buildOrderByClause({
      sort,
      sortDirection,
    })
    const results = await this.fetchIssues({
      commit,
      where: whereConditions,
      having: havingConditions,
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
    having,
    orderBy,
    limit,
    offset,
  }: {
    commit: Commit
    where: SQL[]
    having: SQL[]
    orderBy: SQL[]
    limit: number
    offset: number
  }) {
    const commitIds = await this.getCommitIds({ commit })
    const subquery = this.buildHistogramSubquery({ commitIds })
    // Make listing lighter by excluding description field
    const { description: _, ...issueColumns } = tt

    const query = this.db
      .select({
        ...issueColumns,
        recentCount: sql<number>`COALESCE(${subquery.recentCount}::integer, 0)`,
        totalCount: sql<number>`COALESCE(${subquery.totalCount}::integer, 0)`,
        lastSeenDate: sql<Date>`COALESCE(${subquery.lastSeenDate}, '1970-01-01 00:00:00'::timestamp)`,
        escalatingCount: sql<number>`COALESCE(${subquery.escalatingCount}::integer, 0)`,
        isNew:
          sql<boolean>`(${issues.createdAt} >= NOW() - INTERVAL '7 days')`.as(
            'isNew',
          ),
        isResolved: sql<boolean>`(${issues.resolvedAt} IS NOT NULL)`.as(
          'isResolved',
        ),
        isEscalating: sql<boolean>`(
          CASE
            WHEN COALESCE(${subquery.escalatingCount}::integer, 0) > ${ESCALATING_COUNT_THRESHOLD}
            THEN true
            ELSE false
          END
        )`.as('isEscalating'),
        isIgnored: sql<boolean>`(${issues.ignoredAt} IS NOT NULL)`.as(
          'isIgnored',
        ),
      })
      .from(issues)
      .leftJoin(subquery, eq(subquery.issueId, issues.id))
      .where(and(...where))
      .groupBy(...this.buildGroupByClause(subquery))
      .having(having.length > 0 ? and(...having) : undefined)
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
    const havingConditions = this.buildHavingConditions({ filters })
    const commitIds = await this.getCommitIds({ commit })
    const subquery = this.buildHistogramSubquery({ commitIds })

    const innerQuery = this.db
      .select({ issueId: issues.id })
      .from(issues)
      .leftJoin(subquery, eq(subquery.issueId, issues.id))
      .where(and(...whereConditions))
      .groupBy(...this.buildGroupByClause(subquery))
      .having(
        havingConditions.length > 0 ? and(...havingConditions) : undefined,
      )
      .as('filteredIssues')

    const query = this.db
      .select({ count: sql<number>`COUNT(*)::integer` })
      .from(innerQuery)

    const result = await query
    return Result.ok(result[0]?.count ?? 0)
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

    if (filters.firstSeen) {
      conditions.push(gte(issues.createdAt, filters.firstSeen))
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
        conditions.push(sql`${issues.resolvedAt} IS NOT NULL`)
        conditions.push(isNull(issues.ignoredAt))
        break
    }

    return conditions
  }

  private buildHavingConditions({ filters }: { filters: IssueFilters }) {
    const conditions: SQL[] = []

    const status = filters.status || 'active'

    if (status === 'regressed') {
      conditions.push(
        sql`${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} > ${issues.resolvedAt}`,
      )
    }

    if (filters.lastSeen) {
      const toEndOfDay = endOfDay(filters.lastSeen)
      const condition = sql`${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} <= ${toEndOfDay}`
      if (condition) conditions.push(condition)
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
      dir(sql.raw(`COALESCE("${HISTOGRAM_SUBQUERY_ALIAS}"."recentCount", 0)`)),
      dir(
        sql.raw(
          `COALESCE("${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate", '1970-01-01 00:00:00'::timestamp)`,
        ),
      ),
      dir(issues.id),
    ]
  }

  /**
   * Returns the common GROUP BY clause fields for issues queries with histogram subquery.
   * This includes all issue fields and subquery fields that are selected in the main query.
   */
  private buildGroupByClause(
    subquery: ReturnType<
      IssueHistogramsRepository['getHistogramStatsSubquery']
    >,
  ) {
    return [
      issues.id,
      issues.workspaceId,
      issues.projectId,
      issues.documentUuid,
      issues.title,
      issues.resolvedAt,
      issues.ignoredAt,
      issues.createdAt,
      issues.updatedAt,
      subquery.issueId,
      subquery.recentCount,
      subquery.totalCount,
      subquery.lastSeenDate,
      subquery.escalatingCount,
    ]
  }

  private async getCommitIds({ commit }: { commit: Commit }) {
    const commitsRepo = new CommitsRepository(this.workspaceId, this.db)
    const commits = await commitsRepo.getCommitsHistory({ commit })
    const commitIds = commits.map((c: { id: number }) => c.id)
    return commitIds
  }
}
