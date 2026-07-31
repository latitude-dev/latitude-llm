import type { CostBreakdownDimension, CostSeriesMetric } from "@domain/spans"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { projectScopeData, projectScopeKey, useProjectScope } from "../projects/project-scope.tsx"
import {
  getCacheEconomics,
  getCostBreakdown,
  getCostOverview,
  getCostPerSessionDecomposition,
  getCostSeries,
  getModelUsageSeries,
} from "./cost.functions.ts"

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

/**
 * Carries no previous data across a change: the rows are labelled by the dimension
 * that fetched them, so holding the last result would render model rows under a
 * Provider heading until the refetch lands.
 */
export function useCostBreakdown({
  projectId,
  range,
  dimension,
  enabled = true,
}: {
  readonly projectId: string
  readonly range: CostTimeRange
  readonly dimension: CostBreakdownDimension
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "cost-breakdown", projectId, range, dimension],
    queryFn: () => getCostBreakdown({ data: { ...projectScopeData(scope), projectId, ...range, dimension } }),
    staleTime: COST_STALE_TIME_MS,
    enabled: enabled && projectId.length > 0,
  })
}

/** The comparison window is derived server-side from this one, so it is not a key. */
export function useCostPerSessionDecomposition({
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
    queryKey: [...projectScopeKey(scope), "cost-per-session", projectId, range],
    queryFn: () => getCostPerSessionDecomposition({ data: { ...projectScopeData(scope), projectId, ...range } }),
    staleTime: COST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: enabled && projectId.length > 0,
  })
}

export function useCacheEconomics({
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
    queryKey: [...projectScopeKey(scope), "cache-economics", projectId, range],
    queryFn: () => getCacheEconomics({ data: { ...projectScopeData(scope), projectId, ...range } }),
    staleTime: COST_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    enabled: enabled && projectId.length > 0,
  })
}

/** One payload carries cost and tokens, so the panel's measure toggle is not a query key. */
export function useModelUsageSeries({
  projectId,
  range,
  bucketSeconds,
  enabled = true,
}: {
  readonly projectId: string
  readonly range: CostTimeRange
  readonly bucketSeconds: number
  readonly enabled?: boolean
}) {
  const scope = useProjectScope()
  return useQuery({
    queryKey: [...projectScopeKey(scope), "model-usage-series", projectId, range, bucketSeconds],
    queryFn: () => getModelUsageSeries({ data: { ...projectScopeData(scope), projectId, ...range, bucketSeconds } }),
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
