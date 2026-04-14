import type { ListIssuesResult } from "@domain/issues"
import type { FilterSet } from "@domain/shared"

interface IssuesListTimeRangeInput {
  readonly fromIso?: string | undefined
  readonly toIso?: string | undefined
}

export function buildIssuesTraceCountFilters(timeRange: IssuesListTimeRangeInput | undefined): FilterSet | undefined {
  const startTimeConditions = [
    ...(timeRange?.fromIso ? [{ op: "gte" as const, value: timeRange.fromIso }] : []),
    ...(timeRange?.toIso ? [{ op: "lte" as const, value: timeRange.toIso }] : []),
  ]

  return startTimeConditions.length > 0 ? { startTime: startTimeConditions } : undefined
}

export function withIssuesTraceTotals(result: ListIssuesResult, totalTraces: number): ListIssuesResult {
  return {
    ...result,
    analytics: {
      ...result.analytics,
      totalTraces,
    },
    items: result.items.map((item) => ({
      ...item,
      affectedTracesPercent: totalTraces === 0 ? 0 : Math.min(item.occurrences / totalTraces, 1),
    })),
  }
}
