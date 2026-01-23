import {
  and,
  between,
  countDistinct,
  desc,
  eq,
  isNotNull,
  sql,
} from 'drizzle-orm'
import { LogStats } from '@latitude-data/emails/WeeklyEmailMailTypes'
import { database } from '../../../client'
import { DateRange, SpanType } from '../../../constants'
import { spans } from '../../../schema/models/spans'
import { projects } from '../../../schema/models/projects'
import { Workspace } from '../../../schema/models/types/Workspace'
import { SureDateRange } from '../../../constants'
import { getDateRangeOrLastWeekRange } from '../utils'
import { hasProductionTraces } from '../../traces/hasProductionTraces'

async function getGlobalLogsStats(
  {
    workspace,
    range,
  }: {
    workspace: Workspace
    range: SureDateRange
  },
  db = database,
) {
  const logsCountResult = await db
    .select({ count: countDistinct(spans.traceId) })
    .from(spans)
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        between(spans.startedAt, range.from, range.to),
      ),
    )
    .then((r) => r[0].count)

  const completionStatsResult = await db
    .select({
      totalTokens: sql<number>`COALESCE(SUM(${spans.tokensPrompt}), 0) + COALESCE(SUM(${spans.tokensCompletion}), 0) + COALESCE(SUM(${spans.tokensCached}), 0) + COALESCE(SUM(${spans.tokensReasoning}), 0)`,
      totalCost: sql<number>`COALESCE(SUM(${spans.cost}), 0)`,
    })
    .from(spans)
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        eq(spans.type, SpanType.Completion),
        between(spans.startedAt, range.from, range.to),
      ),
    )
    .then((r) => r[0])

  return {
    logsCount: logsCountResult,
    tokensSpent: Number(completionStatsResult.totalTokens),
    tokensCost: Number(completionStatsResult.totalCost) / 100000, // Cost is stored in millicents
  }
}

async function getTopProjectsLogsStats(
  {
    workspace,
    range,
    projectsLimit,
  }: {
    workspace: Workspace
    range: SureDateRange
    projectsLimit: number
  },
  db = database,
) {
  // Pre-filter spans by date range in subqueries for better performance
  const spansInRangeSubquery = db
    .select({
      projectId: spans.projectId,
      traceId: spans.traceId,
      type: spans.type,
      tokensPrompt: spans.tokensPrompt,
      tokensCompletion: spans.tokensCompletion,
      tokensCached: spans.tokensCached,
      tokensReasoning: spans.tokensReasoning,
      cost: spans.cost,
    })
    .from(spans)
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        isNotNull(spans.projectId),
        between(spans.startedAt, range.from, range.to),
      ),
    )
    .as('spansInRange')

  const projectStats = await db
    .select({
      projectId: projects.id,
      projectName: projects.name,
      logsCount: sql<number>`COUNT(DISTINCT ${spansInRangeSubquery.traceId})`,
      totalTokens: sql<number>`COALESCE(SUM(CASE WHEN ${spansInRangeSubquery.type} = ${SpanType.Completion} THEN ${spansInRangeSubquery.tokensPrompt} ELSE 0 END), 0) + COALESCE(SUM(CASE WHEN ${spansInRangeSubquery.type} = ${SpanType.Completion} THEN ${spansInRangeSubquery.tokensCompletion} ELSE 0 END), 0) + COALESCE(SUM(CASE WHEN ${spansInRangeSubquery.type} = ${SpanType.Completion} THEN ${spansInRangeSubquery.tokensCached} ELSE 0 END), 0) + COALESCE(SUM(CASE WHEN ${spansInRangeSubquery.type} = ${SpanType.Completion} THEN ${spansInRangeSubquery.tokensReasoning} ELSE 0 END), 0)`,
      totalCost: sql<number>`COALESCE(SUM(CASE WHEN ${spansInRangeSubquery.type} = ${SpanType.Completion} THEN ${spansInRangeSubquery.cost} ELSE 0 END), 0)`,
    })
    .from(projects)
    .innerJoin(
      spansInRangeSubquery,
      eq(spansInRangeSubquery.projectId, projects.id),
    )
    .where(eq(projects.workspaceId, workspace.id))
    .groupBy(projects.id, projects.name)
    .orderBy(desc(sql`COUNT(DISTINCT ${spansInRangeSubquery.traceId})`))
    .limit(projectsLimit)

  return projectStats.map((project) => ({
    projectId: project.projectId,
    projectName: project.projectName,
    logsCount: Number(project.logsCount),
    tokensSpent: Number(project.totalTokens),
    tokensCost: Number(project.totalCost) / 100000, // Cost is stored in millicents
  }))
}

export async function getLogsData(
  {
    workspace,
    dateRange,
    projectsLimit = 10,
  }: {
    workspace: Workspace
    dateRange?: DateRange
    projectsLimit?: number
  },
  db = database,
): Promise<LogStats> {
  const usedInProduction = await hasProductionTraces(
    { workspaceId: workspace.id },
    db,
  )

  const range = getDateRangeOrLastWeekRange(dateRange)

  const globalStats = await getGlobalLogsStats({ workspace, range }, db)
  const topProjects = await getTopProjectsLogsStats(
    { workspace, range, projectsLimit },
    db,
  )

  return {
    usedInProduction,
    ...globalStats,
    topProjects,
  }
}
