import {
  and,
  between,
  count,
  countDistinct,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from 'drizzle-orm'
import { LogStats } from '@latitude-data/emails/WeeklyEmailMailTypes'
import { database } from '../../../client'
import {
  DateRange,
  RUN_SOURCES,
  RunSourceGroup,
  SpanType,
} from '../../../constants'
import { spans } from '../../../schema/models/spans'
import { projects } from '../../../schema/models/projects'
import { Workspace } from '../../../schema/models/types/Workspace'
import { SureDateRange } from '../../../constants'
import { getDateRangeOrLastWeekRange } from '../utils'

async function getAllTimesSpansProductionCount(
  { workspace }: { workspace: Workspace },
  db = database,
) {
  return db
    .select({ count: count() })
    .from(spans)
    .where(
      and(
        eq(spans.workspaceId, workspace.id),
        eq(spans.type, SpanType.Prompt),
        inArray(spans.source, RUN_SOURCES[RunSourceGroup.Production]),
      ),
    )
    .then((r) => r[0].count)
}

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
  }: {
    workspace: Workspace
    range: SureDateRange
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
    .limit(10)

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
  }: {
    workspace: Workspace
    dateRange?: DateRange
  },
  db = database,
): Promise<LogStats> {
  const allTimesProductionSpansCount = await getAllTimesSpansProductionCount(
    { workspace },
    db,
  )
  const usedInProduction = allTimesProductionSpansCount > 0

  if (!usedInProduction) {
    return {
      usedInProduction: false,
      logsCount: 0,
      tokensSpent: 0,
      tokensCost: 0,
      topProjects: [],
    }
  }

  const range = getDateRangeOrLastWeekRange(dateRange)

  const globalStats = await getGlobalLogsStats({ workspace, range }, db)
  const topProjects = await getTopProjectsLogsStats({ workspace, range }, db)

  return {
    usedInProduction: true,
    ...globalStats,
    topProjects,
  }
}
