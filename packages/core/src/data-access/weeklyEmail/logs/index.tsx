import {
  and,
  between,
  count,
  countDistinct,
  eq,
  inArray,
  sql,
} from 'drizzle-orm'
import { database } from '../../../client'
import {
  DateRange,
  RUN_SOURCES,
  RunSourceGroup,
  SpanType,
} from '../../../constants'
import { spans } from '../../../schema/models/spans'
import { Workspace } from '../../../schema/models/types/Workspace'
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

export async function getLogsData(
  {
    workspace,
    dateRange,
  }: {
    workspace: Workspace
    dateRange?: DateRange
  },
  db = database,
) {
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
    }
  }

  const range = getDateRangeOrLastWeekRange(dateRange)

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
    usedInProduction: true,
    logsCount: logsCountResult,
    tokensSpent: Number(completionStatsResult.totalTokens),
    tokensCost: Number(completionStatsResult.totalCost) / 100, // Cost is stored in cents
  }
}
