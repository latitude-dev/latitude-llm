import {
  HISTOGRAM_SUBQUERY_ALIAS,
  ISSUE_GROUP,
  ISSUE_STATUS,
  IssueSort,
  SafeIssuesParams,
} from '@latitude-data/constants/issues'
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  sql,
  SQL,
} from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

import { CommitsRepository } from '../../repositories/commitsRepository'
import { DocumentVersionsRepository } from '../../repositories/documentVersionsRepository'
import { commits } from '../../schema/models/commits'
import { issues } from '../../schema/models/issues'
import { type Commit } from '../../schema/models/types/Commit'
import { type Project } from '../../schema/models/types/Project'
import { scopedQuery } from '../scope'
import { getHistogramStatsSubquery } from '../issueHistograms/getHistogramStatsSubquery'
import { tt } from './columns'
import { tenancyFilter } from './filters'
import { buildGroupConditions, issuesWithStatsSelect } from './groupConditions'

type IssueFilters = SafeIssuesParams['filters']
type Sorting = SafeIssuesParams['sorting']

type FilteringArguments = {
  workspaceId: number
  project: Project
  commit: Commit
  filters: IssueFilters
  sorting: Sorting
  page: number
  limit: number
}

export const fetchIssuesFiltered = scopedQuery(
  async function fetchIssuesFiltered(
    {
      workspaceId,
      project,
      commit,
      filters,
      sorting: { sort, sortDirection },
      page,
      limit,
    }: FilteringArguments,
    db,
  ) {
    const offset = (page - 1) * limit
    const activeDocumentUuids = await getActiveDocumentUuids(
      { workspaceId, commit },
      db,
    )
    const whereConditions = buildWhereConditions({
      workspaceId,
      project,
      filters,
      activeDocumentUuids,
    })
    const orderByClause = buildOrderByClause({ sort, sortDirection })

    const commitIds = await getCommitIds({ workspaceId, commit }, db)
    const subquery = getHistogramStatsSubquery(
      { workspaceId, project, commitIds, filters },
      db,
    )

    const mergedIssues = alias(issues, 'mergedIssues')
    const lastCommit = alias(commits, 'lastCommit')
    const results = await db
      .select({
        ...tt,
        ...issuesWithStatsSelect({ subquery }),
        mergedToIssue: {
          id: mergedIssues.id,
          title: mergedIssues.title,
          uuid: mergedIssues.uuid,
        },
        lastCommit: {
          uuid: lastCommit.uuid,
          title: lastCommit.title,
          version: lastCommit.version,
        },
      })
      .from(issues)
      .innerJoin(subquery, eq(subquery.issueId, issues.id))
      .leftJoin(mergedIssues, eq(issues.mergedToIssueId, mergedIssues.id))
      .innerJoin(lastCommit, eq(subquery.lastCommitId, lastCommit.id))
      .where(and(...whereConditions))
      .orderBy(...orderByClause)
      .limit(limit)
      .offset(offset)

    const totalCount = await fetchIssuesCount(
      { workspaceId, project, commit, commitIds, filters, where: whereConditions },
      db,
    )

    return {
      issues: results,
      page,
      limit,
      totalCount,
    }
  },
)

async function fetchIssuesCount(
  {
    workspaceId,
    project,
    commit,
    commitIds,
    filters,
    where,
  }: {
    workspaceId: number
    project: Project
    commit: Commit
    commitIds: number[]
    filters: IssueFilters
    where: SQL[]
  },
  db: any,
) {
  const subquery = getHistogramStatsSubquery(
    { workspaceId, project, commitIds, filters },
    db,
  )

  const innerQuery = db
    .select({ issueId: issues.id })
    .from(issues)
    .innerJoin(subquery, eq(subquery.issueId, issues.id))
    .where(and(...where))
    .as('filteredIssues')

  const result = await db
    .select({ count: sql<number>`COUNT(*)::integer` })
    .from(innerQuery)

  return result[0]?.count ?? 0
}

function buildWhereConditions({
  workspaceId,
  project,
  filters,
  activeDocumentUuids,
}: {
  workspaceId: number
  project: Project
  filters: IssueFilters
  activeDocumentUuids: string[]
}) {
  const conditions: SQL[] = [
    tenancyFilter(workspaceId),
    eq(issues.projectId, project.id),
  ]

  if (activeDocumentUuids.length > 0) {
    conditions.push(inArray(issues.documentUuid, activeDocumentUuids))
  } else {
    conditions.push(sql`FALSE`)
  }

  if (filters.documentUuid) {
    conditions.push(eq(issues.documentUuid, filters.documentUuid))
  }

  if (filters.query && filters.query.trim().length > 0) {
    conditions.push(ilike(issues.title, `%${filters.query}%`))
  }

  const status = filters.status || ISSUE_STATUS.active

  switch (status) {
    case ISSUE_STATUS.active:
      conditions.push(buildGroupConditions(ISSUE_GROUP.active)!)
      break
    case ISSUE_STATUS.inactive:
      conditions.push(buildGroupConditions(ISSUE_GROUP.inactive)!)
      break
  }

  return conditions
}

function buildOrderByClause({
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

async function getCommitIds(
  { workspaceId, commit }: { workspaceId: number; commit: Commit },
  db: any,
) {
  const commitsRepo = new CommitsRepository(workspaceId, db)
  const commits = await commitsRepo.getCommitsHistory({ commit })
  return commits.map((c: { id: number }) => c.id)
}

async function getActiveDocumentUuids(
  { workspaceId, commit }: { workspaceId: number; commit: Commit },
  db: any,
): Promise<string[]> {
  const documentsRepo = new DocumentVersionsRepository(workspaceId, db)
  const documents = await documentsRepo
    .getDocumentsAtCommit(commit)
    .then((r) => r.unwrap())
  return documents.map((d) => d.documentUuid)
}
