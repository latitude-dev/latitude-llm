import type { CostSeriesMetric } from "@domain/spans"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import { getCostOverview, getCostSeries } from "./cost.functions.ts"

/** Time window shared by every cost query — lower bound inclusive, upper bound exclusive. */
interface CostTimeRange {
  readonly fromIso: string
  readonly toIso: string
}

const COST_STALE_TIME_MS = 30_000

export function useCostOverview({
  projectId,
  range,
  enabled = true,
}: {
  readonly projectId: string
  readonly range: CostTimeRange
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "cost-overview", projectId, range],
    queryFn: () => getCostOverview({ data: { ...projectScopeData(scope), projectId, ...range } }),
    staleTime: COST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: enabled && projectId.length > 0,
  })
}

export function useCostSeries({
  projectId,
  range,
  metric,
  bucketSeconds,
  enabled = true,
}: {
  readonly projectId: string
  readonly range: CostTimeRange
  readonly metric: CostSeriesMetric
  readonly bucketSeconds: number
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "cost-series", projectId, range, metric, bucketSeconds],
    queryFn: () => getCostSeries({ data: { ...projectScopeData(scope), projectId, ...range, metric, bucketSeconds } }),
    staleTime: COST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: enabled && projectId.length > 0,
  })
}
