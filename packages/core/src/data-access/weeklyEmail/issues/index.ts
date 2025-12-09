import { and, between, count, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { format } from 'date-fns'
import { database } from '../../../client'
import { DateRange, SureDateRange } from '../../../constants'
import { issueHistograms } from '../../../schema/models/issueHistograms'
import { issues } from '../../../schema/models/issues'
import { projects } from '../../../schema/models/projects'
import { Workspace } from '../../../schema/models/types/Workspace'
import { getDateRangeOrLastWeekRange } from '../utils'

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

export async function getIssuesData(
  {
    workspace,
    dateRange,
  }: {
    workspace: Workspace
    dateRange?: DateRange
  },
  db = database,
) {
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
    }
  }

  const range = getDateRangeOrLastWeekRange(dateRange)
  const globalStats = await getGlobalIssuesStats({ workspace, range }, db)
  const topProjects = await getTopProjectsIssuesStats({ workspace, range }, db)

  return {
    hasIssues: true,
    ...globalStats,
    topProjects,
  }
}
