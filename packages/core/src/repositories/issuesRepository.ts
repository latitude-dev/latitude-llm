import {
  ESCALATING_COUNT_THRESHOLD,
  HISTOGRAM_SUBQUERY_ALIAS,
  ISSUE_GROUP,
  ISSUE_STATUS,
  IssueGroup,
  IssueSort,
  IssueStatuses,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  ilike,
  isNotNull,
  isNull,
  or,
  sql,
  SQL,
} from 'drizzle-orm'
import {
  databaseErrorCodes,
  NotFoundError,
  UnprocessableEntityError,
} from '../lib/errors'
import { Result } from '../lib/Result'
import { issues } from '../schema/models/issues'
import { type Commit } from '../schema/models/types/Commit'
import { DocumentVersion } from '../schema/models/types/DocumentVersion'
import { type Issue } from '../schema/models/types/Issue'
import { type Project } from '../schema/models/types/Project'
import { CommitsRepository } from './commitsRepository'
import { IssueHistogramsRepository } from './issueHistogramsRepository'
import Repository from './repositoryV2'

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

  async lock({ id, wait }: { id: number; wait?: boolean }) {
    // .for('no key update', { noWait: true }) is bugged in drizzle!
    // https://github.com/drizzle-team/drizzle-orm/issues/3554

    try {
      await this.db.execute(sql<boolean>`
        SELECT TRUE
        FROM ${issues}
        WHERE (
          ${issues.workspaceId} = ${this.workspaceId} AND
          ${issues.id} = ${id}
        ) LIMIT 1 FOR NO KEY UPDATE ${sql.raw(wait ? '' : 'NOWAIT')};
          `)
    } catch (error: any) {
      if (error?.code === databaseErrorCodes.lockNotAvailable) {
        return Result.error(
          new UnprocessableEntityError('Cannot obtain lock on issue'),
        )
      }
      return Result.error(error as Error)
    }

    return Result.nil()
  }

  async findById({
    project,
    issueId,
  }: {
    project: Project
    issueId?: number | null
  }) {
    if (!issueId) return null

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
    return result[0]
  }

  async findByUuid(uuid: string) {
    const result = await this.scope
      .where(and(this.scopeFilter, eq(issues.uuid, uuid)))
      .limit(1)
      .then((r) => r[0])

    if (!result) {
      return Result.error(
        new NotFoundError(
          `Record with uuid ${uuid} not found in ${this.scope._.tableName}`,
        ),
      )
    }

    return Result.ok(result)
  }

  async findByTitleAndStatuses({
    project,
    document,
    title,
    statuses,
    group,
  }: {
    project: Project
    document: DocumentVersion
    title: string | null
    statuses?: IssueStatuses[]
    group?: IssueGroup
  }) {
    const whereConditions = this.buildGroupAndStatusConditions({
      statuses,
      group,
    })

    return this.db
      .select({
        id: issues.id,
        title: issues.title,
        documentUuid: issues.documentUuid,
      })
      .from(issues)
      .where(
        and(
          this.scopeFilter,
          eq(issues.projectId, project.id),
          eq(issues.documentUuid, document.documentUuid),
          ilike(issues.title, `%${title ?? ''}%`),
          ...whereConditions,
        ),
      )
      .orderBy(desc(issues.createdAt))
      .limit(20)
  }

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
      project,
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
    project,
    commit,
    where,
    filters,
    orderBy,
    limit,
    offset,
  }: {
    project: Project
    commit: Commit
    filters: IssueFilters
    where: SQL[]
    orderBy: SQL[]
    limit: number
    offset: number
  }) {
    const commitIds = await this.getCommitIds({ commit })
    const subquery = this.buildHistogramSubquery({
      project,
      commitIds,
      filters,
    })

    const query = this.db
      .select({
        ...tt,
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
        isRegressed: sql<boolean>`(
          ${issues.resolvedAt} IS NOT NULL 
          AND ${issues.ignoredAt} IS NULL 
          AND ${subquery.lastSeenDate} > ${issues.resolvedAt}
        )`.as('isRegressed'),
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
    const subquery = this.buildHistogramSubquery({
      project,
      commitIds,
      filters,
    })

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
    project,
    commitIds,
    filters,
  }: {
    project: Project
    commitIds: number[]
    filters: IssueFilters
  }) {
    const histogramRepo = new IssueHistogramsRepository(
      this.workspaceId,
      this.db,
    )
    return histogramRepo.getHistogramStatsSubquery({
      project,
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
      conditions.push(ilike(issues.title, `%${filters.query}%`))
    }

    // In frontend, we only apply group filtering (status in frontend is different than backend)
    const status = filters.status || ISSUE_STATUS.active // Default to active

    switch (status) {
      case ISSUE_STATUS.active:
        conditions.push(this.buildGroupConditions(ISSUE_GROUP.active)!)
        break
      case ISSUE_STATUS.inactive:
        conditions.push(this.buildGroupConditions(ISSUE_GROUP.inactive)!)
        break
    }

    return conditions
  }

  private buildGroupAndStatusConditions({
    statuses,
    group,
  }: { statuses?: IssueStatuses[]; group?: IssueGroup } = {}) {
    const conditions: SQL[] = []
    if (group) {
      conditions.push(this.buildGroupConditions(group)!)
    } else if (statuses && statuses.length > 0) {
      conditions.push(this.buildStatusConditions(statuses)!)
    }
    return conditions
  }

  private buildStatusConditions(statuses: IssueStatuses[]) {
    const statusConditions: SQL[] = []
    for (const status of statuses) {
      switch (status) {
        case IssueStatuses.merged:
          statusConditions.push(this.withMergedIssues(true))
          break
        case IssueStatuses.regressed:
          statusConditions.push(this.withRegressedIssues(true))
          break
        case IssueStatuses.resolved:
          statusConditions.push(this.withResolvedIssues(true))
          break
        case IssueStatuses.ignored:
          statusConditions.push(this.withIgnoredIssues(true))
          break
        case IssueStatuses.escalating:
          statusConditions.push(this.withEscalatingIssues(true))
          break
        case IssueStatuses.new:
          statusConditions.push(this.withNewIssues(true))
          break
      }
    }
    return statusConditions.length > 0 ? and(...statusConditions) : undefined
  }

  private buildGroupConditions(group: IssueGroup = ISSUE_GROUP.active) {
    // Default to active
    // Can only apply one group condition at a time
    let groupConditions: SQL | undefined
    switch (group) {
      case 'active':
        groupConditions = or(
          and(this.withResolvedIssues(false), this.withIgnoredIssues(false)),
          this.withRegressedIssues(true),
        )!
        break
      case 'inactive':
        groupConditions = or(
          this.withIgnoredIssues(true),
          // Resolved without regression (histogram data before or at resolved date)
          sql`(${issues.resolvedAt} IS NOT NULL AND ${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} <= ${issues.resolvedAt})`,
        )!
        break
      case 'activeWithResolved':
        groupConditions = and(
          this.withResolvedIssues(true),
          this.withIgnoredIssues(false),
        )!
        break
    }
    return groupConditions
  }

  private withMergedIssues(include: boolean): SQL {
    return include ? isNotNull(issues.mergedAt) : isNull(issues.mergedAt)
  }

  private withRegressedIssues(include: boolean): SQL {
    return include
      ? sql`${issues.resolvedAt} IS NOT NULL AND ${issues.ignoredAt} IS NULL AND ${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} > ${issues.resolvedAt}`
      : sql`${issues.resolvedAt} IS NULL OR ${issues.ignoredAt} IS NOT NULL OR ${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."lastSeenDate"`)} <= ${issues.resolvedAt}`
  }

  private withResolvedIssues(include: boolean): SQL {
    return include ? isNotNull(issues.resolvedAt) : isNull(issues.resolvedAt)
  }

  private withIgnoredIssues(include: boolean): SQL {
    return include ? isNotNull(issues.ignoredAt) : isNull(issues.ignoredAt)
  }

  private withEscalatingIssues(include: boolean): SQL {
    return include
      ? sql`${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."escalatingCount"`)} > ${ESCALATING_COUNT_THRESHOLD}`
      : sql`${sql.raw(`"${HISTOGRAM_SUBQUERY_ALIAS}"."escalatingCount"`)} <= ${ESCALATING_COUNT_THRESHOLD}`
  }

  private withNewIssues(include: boolean): SQL {
    return include
      ? sql`${issues.createdAt} >= NOW() - INTERVAL '7 days'`
      : sql`${issues.createdAt} < NOW() - INTERVAL '7 days'`
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
