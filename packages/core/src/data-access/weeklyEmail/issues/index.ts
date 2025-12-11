import {
  and,
  between,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from 'drizzle-orm'
import { format } from 'date-fns'
import { database } from '../../../client'
import { DateRange, SureDateRange } from '../../../constants'
import { issueHistograms } from '../../../schema/models/issueHistograms'
import { issues } from '../../../schema/models/issues'
import { projects } from '../../../schema/models/projects'
import { commits } from '../../../schema/models/commits'
import { Workspace } from '../../../schema/models/types/Workspace'
import { getDateRangeOrLastWeekRange } from '../utils'
import { IssueStats } from '@latitude-data/emails/WeeklyEmailMailTypes'

async function getAllTimesIssuesCount(
  { workspace }: { workspace: Workspace },
  db = database,
) {
  return db
    .select({ count: count() })
    .from(issues)
    .where(eq(issues.workspaceId, workspace.id))
    .then((r) => r[0].count)
}

function buildHistogramSubquery(
  {
    workspace,
    fromDate,
    toDate,
  }: {
    workspace: Workspace
    fromDate: string
    toDate: string
  },
  db = database,
) {
  return db
    .select({
      issueId: issueHistograms.issueId,
    })
    .from(issueHistograms)
    .where(
      and(
        eq(issueHistograms.workspaceId, workspace.id),
        between(issueHistograms.date, fromDate, toDate),
      ),
    )
    .groupBy(issueHistograms.issueId)
    .as('histogramSubquery')
}

function buildRegressedSubquery(
  {
    workspace,
    fromDate,
    toDate,
  }: {
    workspace: Workspace
    fromDate: string
    toDate: string
  },
  db = database,
) {
  return db
    .select({
      issueId: issueHistograms.issueId,
    })
    .from(issueHistograms)
    .innerJoin(issues, eq(issueHistograms.issueId, issues.id))
    .where(
      and(
        eq(issueHistograms.workspaceId, workspace.id),
        isNotNull(issues.resolvedAt),
        sql`${issueHistograms.date} > ${issues.resolvedAt}`,
        between(issueHistograms.date, fromDate, toDate),
      ),
    )
    .groupBy(issueHistograms.issueId)
    .as('regressedSubquery')
}

async function getGlobalIssuesStats(
  {
    workspace,
    range,
  }: {
    workspace: Workspace
    range: SureDateRange
  },
  db = database,
) {
  const fromDate = format(range.from, 'yyyy-MM-dd')
  const toDate = format(range.to, 'yyyy-MM-dd')

  const histogramSubquery = buildHistogramSubquery(
    { workspace, fromDate, toDate },
    db,
  )
  const regressedSubquery = buildRegressedSubquery(
    { workspace, fromDate, toDate },
    db,
  )

  const stats = await db
    .select({
      issuesCount: sql<number>`COUNT(DISTINCT ${issues.id})`,
      newIssuesCount: sql<number>`SUM(CASE WHEN ${issues.createdAt} BETWEEN ${range.from} AND ${range.to} THEN 1 ELSE 0 END)`,
      escalatedIssuesCount: sql<number>`SUM(CASE WHEN ${issues.escalatingAt} BETWEEN ${range.from} AND ${range.to} AND ${issues.escalatingAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      resolvedIssuesCount: sql<number>`SUM(CASE WHEN ${issues.resolvedAt} BETWEEN ${range.from} AND ${range.to} AND ${issues.resolvedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      ignoredIssuesCount: sql<number>`SUM(CASE WHEN ${issues.ignoredAt} BETWEEN ${range.from} AND ${range.to} AND ${issues.ignoredAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      regressedIssuesCount: sql<number>`SUM(CASE WHEN ${regressedSubquery.issueId} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(issues)
    .innerJoin(histogramSubquery, eq(issues.id, histogramSubquery.issueId))
    .leftJoin(regressedSubquery, eq(issues.id, regressedSubquery.issueId))
    .where(eq(issues.workspaceId, workspace.id))
    .then((r) => r[0])

  // If no issues found, return zeros
  if (!stats || Number(stats.issuesCount) === 0) {
    return {
      issuesCount: 0,
      newIssuesCount: 0,
      escalatedIssuesCount: 0,
      resolvedIssuesCount: 0,
      ignoredIssuesCount: 0,
      regressedIssuesCount: 0,
    }
  }

  return {
    issuesCount: Number(stats.issuesCount),
    newIssuesCount: Number(stats.newIssuesCount),
    escalatedIssuesCount: Number(stats.escalatedIssuesCount),
    resolvedIssuesCount: Number(stats.resolvedIssuesCount),
    ignoredIssuesCount: Number(stats.ignoredIssuesCount),
    regressedIssuesCount: Number(stats.regressedIssuesCount),
  }
}

async function getTopProjectsIssuesStats(
  {
    workspace,
    range,
  }: {
    workspace: Workspace
    range: SureDateRange
  },
  db = database,
) {
  const fromDate = format(range.from, 'yyyy-MM-dd')
  const toDate = format(range.to, 'yyyy-MM-dd')

  const histogramSubquery = buildHistogramSubquery(
    { workspace, fromDate, toDate },
    db,
  )
  const regressedSubquery = buildRegressedSubquery(
    { workspace, fromDate, toDate },
    db,
  )

  const projectStats = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      issuesCount: sql<number>`COUNT(DISTINCT ${issues.id})`,
      newIssuesCount: sql<number>`SUM(CASE WHEN ${issues.createdAt} BETWEEN ${range.from} AND ${range.to} THEN 1 ELSE 0 END)`,
      escalatedIssuesCount: sql<number>`SUM(CASE WHEN ${issues.escalatingAt} BETWEEN ${range.from} AND ${range.to} AND ${issues.escalatingAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      resolvedIssuesCount: sql<number>`SUM(CASE WHEN ${issues.resolvedAt} BETWEEN ${range.from} AND ${range.to} AND ${issues.resolvedAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      ignoredIssuesCount: sql<number>`SUM(CASE WHEN ${issues.ignoredAt} BETWEEN ${range.from} AND ${range.to} AND ${issues.ignoredAt} IS NOT NULL THEN 1 ELSE 0 END)`,
      regressedIssuesCount: sql<number>`SUM(CASE WHEN ${regressedSubquery.issueId} IS NOT NULL THEN 1 ELSE 0 END)`,
    })
    .from(issues)
    .innerJoin(histogramSubquery, eq(issues.id, histogramSubquery.issueId))
    .innerJoin(projects, eq(issues.projectId, projects.id))
    .leftJoin(regressedSubquery, eq(issues.id, regressedSubquery.issueId))
    .where(eq(issues.workspaceId, workspace.id))
    .groupBy(projects.id, projects.name)
    .orderBy(desc(sql`COUNT(DISTINCT ${issues.id})`))
    .limit(10)

  return projectStats.map((project) => ({
    projectId: project.projectId,
    projectName: project.projectName,
    issuesCount: Number(project.issuesCount),
    newIssuesCount: Number(project.newIssuesCount),
    escalatedIssuesCount: Number(project.escalatedIssuesCount),
    resolvedIssuesCount: Number(project.resolvedIssuesCount),
    ignoredIssuesCount: Number(project.ignoredIssuesCount),
    regressedIssuesCount: Number(project.regressedIssuesCount),
  }))
}

async function getNewIssuesList(
  {
    workspace,
    range,
  }: {
    workspace: Workspace
    range: SureDateRange
  },
  db = database,
) {
  const newIssueIds = await db
    .select({ id: issues.id })
    .from(issues)
    .where(
      and(
        eq(issues.workspaceId, workspace.id),
        between(issues.createdAt, range.from, range.to),
      ),
    )
    .then((rows) => rows.map((r) => r.id))

  if (newIssueIds.length === 0) return []

  // Subquery to get the latest histogram for each new issue using window function
  // ROW_NUMBER() assigns 1 to the most recent histogram per issue (PARTITION BY issueId)
  // This is more efficient than a correlated subquery as it scans the table once
  const latestHistogramSubquery = db
    .select({
      issueId: issueHistograms.issueId,
      commitId: issueHistograms.commitId,
      rowNum:
        sql<number>`ROW_NUMBER() OVER (PARTITION BY ${issueHistograms.issueId} ORDER BY ${issueHistograms.occurredAt} DESC)`.as(
          'row_num',
        ),
    })
    .from(issueHistograms)
    .where(
      and(
        eq(issueHistograms.workspaceId, workspace.id),
        inArray(issueHistograms.issueId, newIssueIds),
      ),
    )
    .as('latestHistogram')

  return db
    .select({
      id: issues.id,
      title: issues.title,
      projectId: issues.projectId,
      projectName: projects.name,
      commitUuid: commits.uuid,
    })
    .from(issues)
    .innerJoin(
      latestHistogramSubquery,
      and(
        eq(issues.id, latestHistogramSubquery.issueId),
        eq(latestHistogramSubquery.rowNum, 1),
      ),
    )
    .innerJoin(commits, eq(latestHistogramSubquery.commitId, commits.id))
    .innerJoin(projects, eq(issues.projectId, projects.id))
    .where(inArray(issues.id, newIssueIds))
    .orderBy(desc(issues.createdAt))
    .limit(10)
}

export async function getIssuesData(
  {
    workspace,
    dateRange,
  }: {
    workspace: Workspace
    dateRange?: DateRange
  },
  db = database,
): Promise<IssueStats> {
  const allTimesIssuesCount = await getAllTimesIssuesCount({ workspace }, db)
  const hasIssues = allTimesIssuesCount > 0

  if (!hasIssues) {
    return {
      hasIssues: false,
      issuesCount: 0,
      newIssuesCount: 0,
      escalatedIssuesCount: 0,
      resolvedIssuesCount: 0,
      ignoredIssuesCount: 0,
      regressedIssuesCount: 0,
      topProjects: [],
      newIssuesList: [],
    }
  }

  const range = getDateRangeOrLastWeekRange(dateRange)
  const globalStats = await getGlobalIssuesStats({ workspace, range }, db)
  const topProjects = await getTopProjectsIssuesStats({ workspace, range }, db)
  const newIssuesList =
    globalStats.newIssuesCount > 0
      ? await getNewIssuesList({ workspace, range }, db)
      : []

  return {
    hasIssues: true,
    ...globalStats,
    topProjects,
    newIssuesList,
  }
}
