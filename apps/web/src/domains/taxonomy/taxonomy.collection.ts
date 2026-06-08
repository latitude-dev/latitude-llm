import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import {
  type BehaviourSessionFilter,
  type BehaviourTimeRangeRecord,
  type BehaviourTrajectoryAxis,
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

const clusterProfileQueryKey = (
  projectId: string,
  clusterId: string,
  timeRange: BehaviourTimeRangeRecord | undefined,
) => ["taxonomyClusterProfile", projectId, clusterId, timeRangeKey(timeRange)] as const
const behaviourSessionsQueryKey = (
  projectId: string,
  clusterId: string,
  filter: BehaviourSessionFilter,
  timeRange: BehaviourTimeRangeRecord | undefined,
) => ["behaviourSessions", projectId, clusterId, filter, timeRangeKey(timeRange)] as const
const behaviourTrajectoryQueryKey = (
  projectId: string,
  categoryClusterIds: readonly string[],
  axis: BehaviourTrajectoryAxis,
  timeRange: BehaviourTimeRangeRecord | undefined,
) =>
  ["behaviourTrajectory", projectId, [...categoryClusterIds].sort().join(","), axis, timeRangeKey(timeRange)] as const
const projectBehavioursQueryKey = (input: {
  readonly projectId: string
  readonly dimension: BehaviourDimension
  readonly segment: BehaviourSegment
  readonly sortBy: BehaviourSortBy
  readonly timeRange: BehaviourTimeRangeRecord | undefined
}) =>
  [
    "projectBehaviours",
    input.projectId,
    input.dimension,
    input.segment,
    input.sortBy,
    timeRangeKey(input.timeRange),
  ] as const

export function useClusterProfile(
  projectId: string,
  clusterId: string | undefined,
  timeRange: BehaviourTimeRangeRecord | undefined,
) {
  return useQuery({
    queryKey: clusterProfileQueryKey(projectId, clusterId ?? "", timeRange),
    queryFn: () =>
      getClusterProfile({ data: { projectId, clusterId: clusterId ?? "", ...(timeRange ? { timeRange } : {}) } }),
    staleTime: 30_000,
    enabled: projectId.length > 0 && Boolean(clusterId),
  })
}

export function useBehaviourSessions(
  projectId: string,
  clusterId: string | undefined,
  filter: BehaviourSessionFilter,
  timeRange: BehaviourTimeRangeRecord | undefined,
) {
  return useInfiniteQuery({
    queryKey: behaviourSessionsQueryKey(projectId, clusterId ?? "", filter, timeRange),
    queryFn: ({ pageParam }) =>
      getBehaviourSessions({
        data: {
          projectId,
          clusterId: clusterId ?? "",
          filter,
          offset: pageParam,
          limit: 50,
          ...(timeRange ? { timeRange } : {}),
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
) {
  return useQuery({
    queryKey: behaviourTrajectoryQueryKey(projectId, categoryClusterIds, axis, timeRange),
    queryFn: () =>
      getBehaviourTrajectory({
        data: { projectId, categoryClusterIds: [...categoryClusterIds], axis, ...(timeRange ? { timeRange } : {}) },
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
}: {
  readonly projectId: string
  readonly dimension: BehaviourDimension
  readonly segment: BehaviourSegment
  readonly sortBy: BehaviourSortBy
  readonly timeRange?: BehaviourTimeRangeRecord
}) {
  return useQuery({
    queryKey: projectBehavioursQueryKey({ projectId, dimension, segment, sortBy, timeRange }),
    queryFn: () =>
      getProjectBehaviours({ data: { projectId, dimension, segment, sortBy, ...(timeRange ? { timeRange } : {}) } }),
    staleTime: 30_000,
    enabled: projectId.length > 0,
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
