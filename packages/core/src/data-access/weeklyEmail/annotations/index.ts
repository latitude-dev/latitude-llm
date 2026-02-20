import { and, between, count, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { database } from '../../../client'
import { DateRange, EvaluationType, SureDateRange } from '../../../constants'
import { evaluationResultsV2 } from '../../../schema/models/evaluationResultsV2'
import { evaluationVersions } from '../../../schema/models/evaluationVersions'
import { projects } from '../../../schema/models/projects'
import { commits } from '../../../schema/models/commits'
import { Workspace } from '../../../schema/models/types/Workspace'
import { getDateRangeOrLastWeekRange } from '../utils'
import { AnnotationStats } from '@latitude-data/emails/WeeklyEmailMailTypes'
import { findFirstProject } from '../../../queries/projects/findFirst'
import { isClickHouseEvaluationResultsReadEnabled } from '../../../services/workspaceFeatures/isClickHouseEvaluationResultsReadEnabled'
import {
  getAnnotationsStats,
  getAllTimesAnnotationsCount as chGetAllTimesAnnotationsCount,
  getTopProjectsAnnotations,
} from '../../../queries/clickhouse/evaluationResultsV2/getAnnotationsStats'

async function getAllTimesAnnotationsCount(
  { workspace }: { workspace: Workspace },
  db = database,
) {
  return db
    .select({ count: count() })
    .from(evaluationResultsV2)
    .innerJoin(
      evaluationVersions,
      eq(evaluationResultsV2.evaluationUuid, evaluationVersions.evaluationUuid),
    )
    .where(
      and(
        eq(evaluationResultsV2.workspaceId, workspace.id),
        eq(evaluationVersions.type, EvaluationType.Human),
      ),
    )
    .then((r) => r[0].count)
}

async function getAllAnnotationsCount(
  { workspace, range }: { workspace: Workspace; range: SureDateRange },
  db = database,
) {
  const globalTotals = await db
    .select({
      totalCount: sql<number>`COUNT(*)`,
      passedCount: sql<number>`SUM(CASE WHEN ${evaluationResultsV2.hasPassed} = true THEN 1 ELSE 0 END)`,
      failedCount: sql<number>`SUM(CASE WHEN ${evaluationResultsV2.hasPassed} = false THEN 1 ELSE 0 END)`,
    })
    .from(evaluationResultsV2)
    .innerJoin(
      evaluationVersions,
      eq(evaluationResultsV2.evaluationUuid, evaluationVersions.evaluationUuid),
    )
    .where(
      and(
        eq(evaluationResultsV2.workspaceId, workspace.id),
        eq(evaluationVersions.type, EvaluationType.Human),
        isNotNull(evaluationResultsV2.hasPassed),
        between(evaluationResultsV2.createdAt, range.from, range.to),
      ),
    )
    .then((r) => r[0])

  const passedCount = Number(globalTotals.passedCount)
  const failedCount = Number(globalTotals.failedCount)
  const totalCount = Number(globalTotals.totalCount)
  const passedPercentage = totalCount > 0 ? (passedCount / totalCount) * 100 : 0
  const failedPercentage = totalCount > 0 ? (failedCount / totalCount) * 100 : 0
  return {
    totalCount,
    passedCount,
    failedCount,
    passedPercentage,
    failedPercentage,
  }
}

async function getTopProjectsAnnotationsData(
  { workspace, range }: { workspace: Workspace; range: SureDateRange },
  db = database,
) {
  const topProjectsData = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      totalCount: sql<number>`COUNT(*)`,
      passedCount: sql<number>`SUM(CASE WHEN ${evaluationResultsV2.hasPassed} = true THEN 1 ELSE 0 END)`,
      failedCount: sql<number>`SUM(CASE WHEN ${evaluationResultsV2.hasPassed} = false THEN 1 ELSE 0 END)`,
    })
    .from(evaluationResultsV2)
    .innerJoin(
      evaluationVersions,
      eq(evaluationResultsV2.evaluationUuid, evaluationVersions.evaluationUuid),
    )
    .innerJoin(commits, eq(evaluationResultsV2.commitId, commits.id))
    .innerJoin(projects, eq(commits.projectId, projects.id))
    .where(
      and(
        eq(evaluationResultsV2.workspaceId, workspace.id),
        eq(evaluationVersions.type, EvaluationType.Human),
        isNotNull(evaluationResultsV2.hasPassed),
        between(evaluationResultsV2.createdAt, range.from, range.to),
      ),
    )
    .groupBy(projects.id, projects.name)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(10)

  return topProjectsData.map((row) => {
    const total = Number(row.totalCount)
    const passed = Number(row.passedCount)
    const failed = Number(row.failedCount)
    return {
      projectId: row.projectId,
      projectName: row.projectName,
      annotationsCount: total,
      passedCount: passed,
      failedCount: failed,
      passedPercentage: total > 0 ? (passed / total) * 100 : 0,
      failedPercentage: total > 0 ? (failed / total) * 100 : 0,
    }
  })
}

export async function getAnnotationsData(
  {
    workspace,
    dateRange,
  }: {
    workspace: Workspace
    dateRange?: DateRange
  },
  db = database,
): Promise<AnnotationStats> {
  const shouldUseClickHouse = await isClickHouseEvaluationResultsReadEnabled(
    workspace.id,
    db,
  )

  let allTimesAnnotationsCount: number

  if (shouldUseClickHouse) {
    allTimesAnnotationsCount = await chGetAllTimesAnnotationsCount(
      { workspaceId: workspace.id },
      db,
    )
  } else {
    allTimesAnnotationsCount = await getAllTimesAnnotationsCount(
      { workspace },
      db,
    )
  }

  const hasAnnotations = allTimesAnnotationsCount > 0

  if (!hasAnnotations) {
    const firstProject = await findFirstProject(
      { workspaceId: workspace.id },
      db,
    )

    return {
      hasAnnotations: false,
      annotationsCount: 0,
      passedCount: 0,
      failedCount: 0,
      passedPercentage: 0,
      failedPercentage: 0,
      topProjects: [],
      firstProjectId: firstProject?.id ?? null,
    }
  }

  const range = getDateRangeOrLastWeekRange(dateRange)

  let all: {
    totalCount: number
    passedCount: number
    failedCount: number
    passedPercentage: number
    failedPercentage: number
  }
  let topProjectsData: {
    projectId: number
    projectName: string
    annotationsCount: number
    passedCount: number
    failedCount: number
    passedPercentage: number
    failedPercentage: number
  }[]

  if (shouldUseClickHouse) {
    const statsResult = await getAnnotationsStats(
      {
        workspaceId: workspace.id,
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
      },
      db,
    )
    const stats = Array.isArray(statsResult) ? statsResult[0] : statsResult

    all = {
      totalCount: stats?.total_count ?? 0,
      passedCount: stats?.passed_count ?? 0,
      failedCount: stats?.failed_count ?? 0,
      passedPercentage:
        stats?.total_count && stats.total_count > 0
          ? (stats.passed_count / stats.total_count) * 100
          : 0,
      failedPercentage:
        stats?.total_count && stats.total_count > 0
          ? (stats.failed_count / stats.total_count) * 100
          : 0,
    }

    const topProjectsRaw = await getTopProjectsAnnotations(
      {
        workspaceId: workspace.id,
        dateFrom: range.from.toISOString(),
        dateTo: range.to.toISOString(),
        limit: 10,
      },
      db,
    )

    topProjectsData = (
      topProjectsRaw as unknown as Array<{
        project_id: number
        total_count: number
        passed_count: number
        failed_count: number
      }>
    ).map((row) => {
      const total = row.total_count
      const passed = row.passed_count
      const failed = row.failed_count
      return {
        projectId: row.project_id,
        projectName: `Project ${row.project_id}`,
        annotationsCount: total,
        passedCount: passed,
        failedCount: failed,
        passedPercentage: total > 0 ? (passed / total) * 100 : 0,
        failedPercentage: total > 0 ? (failed / total) * 100 : 0,
      }
    })
  } else {
    all = await getAllAnnotationsCount({ workspace, range }, db)
    topProjectsData = await getTopProjectsAnnotationsData(
      { workspace, range },
      db,
    )
  }

  return {
    hasAnnotations: true,
    annotationsCount: all.totalCount,
    passedCount: all.passedCount,
    failedCount: all.failedCount,
    passedPercentage: all.passedPercentage,
    failedPercentage: all.failedPercentage,
    topProjects: topProjectsData,
    firstProjectId:
      topProjectsData.length > 0 ? topProjectsData[0]!.projectId : null,
  }
}
