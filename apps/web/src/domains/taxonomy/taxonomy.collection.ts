import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import {
  type BehaviourMomentRangeRecord,
  type BehaviourSessionFilter,
  type BehaviourTimeRangeRecord,
  type BehaviourTrajectoryAxis,
  getBehaviourCoverage,
  getBehaviourSessions,
  getBehaviourTrajectory,
  getClusterProfile,
  getProjectBehaviours,
  getTopicFilterOptions,
} from "./taxonomy.functions.ts"

export type BehaviourSegment = "all" | "new_this_week" | "spiking" | "high_escalation"
type BehaviourDimension = "topic"
type BehaviourSortBy = "category" | "volume" | "trend" | "first_seen" | "last_seen" | "escalation_rate"

const timeRangeKey = (timeRange: BehaviourTimeRangeRecord | undefined) =>
  `${timeRange?.fromIso ?? ""}:${timeRange?.toIso ?? ""}`
const momentRangeKey = (momentRange: BehaviourMomentRangeRecord | undefined) =>
  momentRange ? `${momentRange.metric}:${momentRange.fromTurn}:${momentRange.toTurn}` : ""

const scopeKey = (customBehaviorId: string | undefined) => customBehaviorId ?? "global"

const clusterProfileQueryKey = (
  projectId: string,
  clusterId: string,
  timeRange: BehaviourTimeRangeRecord | undefined,
  customBehaviorId: string | undefined,
) => ["taxonomyClusterProfile", projectId, scopeKey(customBehaviorId), clusterId, timeRangeKey(timeRange)] as const
const behaviourSessionsQueryKey = (
  projectId: string,
  clusterId: string,
  filter: BehaviourSessionFilter,
  timeRange: BehaviourTimeRangeRecord | undefined,
  momentRange: BehaviourMomentRangeRecord | undefined,
  customBehaviorId: string | undefined,
) =>
  [
    "behaviourSessions",
    projectId,
    scopeKey(customBehaviorId),
    clusterId,
    filter,
    timeRangeKey(timeRange),
    momentRangeKey(momentRange),
  ] as const
const behaviourTrajectoryQueryKey = (
  projectId: string,
  categoryClusterIds: readonly string[],
  axis: BehaviourTrajectoryAxis,
  timeRange: BehaviourTimeRangeRecord | undefined,
  customBehaviorId: string | undefined,
) =>
  [
    "behaviourTrajectory",
    projectId,
    scopeKey(customBehaviorId),
    [...categoryClusterIds].sort().join(","),
    axis,
    timeRangeKey(timeRange),
  ] as const
const projectBehavioursQueryKey = (input: {
  readonly projectId: string
  readonly dimension: BehaviourDimension
  readonly segment: BehaviourSegment
  readonly sortBy: BehaviourSortBy
  readonly timeRange: BehaviourTimeRangeRecord | undefined
  readonly customBehaviorId: string | undefined
}) =>
  [
    "projectBehaviours",
    input.projectId,
    scopeKey(input.customBehaviorId),
    input.dimension,
    input.segment,
    input.sortBy,
    timeRangeKey(input.timeRange),
  ] as const

export function useClusterProfile(
  projectId: string,
  clusterId: string | undefined,
  timeRange: BehaviourTimeRangeRecord | undefined,
  customBehaviorId?: string,
  facetId?: string,
) {
  return useQuery({
    queryKey: clusterProfileQueryKey(projectId, clusterId ?? "", timeRange, customBehaviorId),
    queryFn: () =>
      getClusterProfile({
        data: {
          projectId,
          clusterId: clusterId ?? "",
          ...(timeRange ? { timeRange } : {}),
          ...(customBehaviorId ? { customBehaviorId } : {}),
          ...(facetId ? { facetId } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0 && Boolean(clusterId),
  })
}

export function useBehaviourSessions(
  projectId: string,
  clusterId: string | undefined,
  filter: BehaviourSessionFilter,
  timeRange: BehaviourTimeRangeRecord | undefined,
  momentRange: BehaviourMomentRangeRecord | undefined,
  customBehaviorId?: string,
  facetId?: string,
) {
  return useInfiniteQuery({
    queryKey: behaviourSessionsQueryKey(projectId, clusterId ?? "", filter, timeRange, momentRange, customBehaviorId),
    queryFn: ({ pageParam }) =>
      getBehaviourSessions({
        data: {
          projectId,
          clusterId: clusterId ?? "",
          filter,
          offset: pageParam,
          limit: 50,
          ...(timeRange ? { timeRange } : {}),
          ...(momentRange ? { momentRange } : {}),
          ...(customBehaviorId ? { customBehaviorId } : {}),
          ...(facetId ? { facetId } : {}),
        },
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage?.nextOffset ?? undefined,
    staleTime: 30_000,
    enabled: projectId.length > 0 && Boolean(clusterId),
  })
}

export function useBehaviourTrajectory(
  projectId: string,
  categoryClusterIds: readonly string[],
  axis: BehaviourTrajectoryAxis,
  timeRange: BehaviourTimeRangeRecord | undefined,
  customBehaviorId?: string,
  facetId?: string,
) {
  return useQuery({
    queryKey: behaviourTrajectoryQueryKey(projectId, categoryClusterIds, axis, timeRange, customBehaviorId),
    queryFn: () =>
      getBehaviourTrajectory({
        data: {
          projectId,
          categoryClusterIds: [...categoryClusterIds],
          axis,
          ...(timeRange ? { timeRange } : {}),
          ...(customBehaviorId ? { customBehaviorId } : {}),
          ...(facetId ? { facetId } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0 && categoryClusterIds.length > 0,
  })
}

export function useProjectBehaviours({
  projectId,
  dimension,
  segment,
  sortBy,
  timeRange,
  pollUntilTopics,
  poll,
  customBehaviorId,
  facetId,
  enabled = true,
}: {
  readonly projectId: string
  readonly dimension: BehaviourDimension
  readonly segment: BehaviourSegment
  readonly sortBy: BehaviourSortBy
  readonly timeRange?: BehaviourTimeRangeRecord
  readonly pollUntilTopics?: boolean
  /** Force a refetch loop regardless of current topics — used while a scoped
   * behavior is generating so the tree appears as soon as the run writes it. */
  readonly poll?: boolean
  readonly customBehaviorId?: string
  readonly facetId?: string
  /** Hold the read until the caller's range is final — a first fetch under a range that is about to be clipped is wasted. */
  readonly enabled?: boolean
}) {
  return useQuery({
    queryKey: projectBehavioursQueryKey({ projectId, dimension, segment, sortBy, timeRange, customBehaviorId }),
    queryFn: () =>
      getProjectBehaviours({
        data: {
          projectId,
          dimension,
          segment,
          sortBy,
          ...(timeRange ? { timeRange } : {}),
          ...(customBehaviorId ? { customBehaviorId } : {}),
          ...(facetId ? { facetId } : {}),
        },
      }),
    staleTime: 30_000,
    enabled: projectId.length > 0 && enabled,
    refetchInterval: (query) => {
      if (poll) return 4_000
      return pollUntilTopics && (query.state.data?.topics.length ?? 0) === 0 ? 5_000 : false
    },
  })
}

/**
 * The band a facet lens has membership for, or null when it covers whole project
 * history. Keyed without a time range: it bounds the range rather than answering
 * one, so it must resolve before a range is applied.
 */
export function useBehaviourCoverage({
  projectId,
  customBehaviorId,
  facetId,
}: {
  readonly projectId: string
  readonly customBehaviorId?: string
  readonly facetId?: string
}) {
  return useQuery({
    queryKey: ["behaviourCoverage", projectId, customBehaviorId ?? "", facetId ?? ""] as const,
    queryFn: () =>
      getBehaviourCoverage({
        data: { projectId, customBehaviorId: customBehaviorId ?? "", facetId: facetId ?? "" },
      }),
    staleTime: 60_000,
    enabled: projectId.length > 0 && Boolean(customBehaviorId) && Boolean(facetId),
  })
}

export function useTopicFilterOptions(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ["taxonomyTopicFilterOptions", projectId] as const,
    queryFn: () => getTopicFilterOptions({ data: { projectId } }),
    staleTime: 60_000,
    enabled: enabled && projectId.length > 0,
  })
}
