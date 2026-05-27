import { useInfiniteQuery, useQuery } from "@tanstack/react-query"
import {
  type BehaviourSessionFilter,
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

const clusterProfileQueryKey = (projectId: string, clusterId: string) =>
  ["taxonomyClusterProfile", projectId, clusterId] as const
const behaviourSessionsQueryKey = (projectId: string, clusterId: string, filter: BehaviourSessionFilter) =>
  ["behaviourSessions", projectId, clusterId, filter] as const
const behaviourTrajectoryQueryKey = (
  projectId: string,
  categoryClusterIds: readonly string[],
  axis: BehaviourTrajectoryAxis,
) => ["behaviourTrajectory", projectId, [...categoryClusterIds].sort().join(","), axis] as const
const projectBehavioursQueryKey = (input: {
  readonly projectId: string
  readonly dimension: BehaviourDimension
  readonly segment: BehaviourSegment
  readonly sortBy: BehaviourSortBy
}) => ["projectBehaviours", input.projectId, input.dimension, input.segment, input.sortBy] as const

export function useClusterProfile(projectId: string, clusterId: string | undefined) {
  return useQuery({
    queryKey: clusterProfileQueryKey(projectId, clusterId ?? ""),
    queryFn: () => getClusterProfile({ data: { projectId, clusterId: clusterId ?? "" } }),
    staleTime: 30_000,
    enabled: projectId.length > 0 && Boolean(clusterId),
  })
}

export function useBehaviourSessions(projectId: string, clusterId: string | undefined, filter: BehaviourSessionFilter) {
  return useInfiniteQuery({
    queryKey: behaviourSessionsQueryKey(projectId, clusterId ?? "", filter),
    queryFn: ({ pageParam }) =>
      getBehaviourSessions({ data: { projectId, clusterId: clusterId ?? "", filter, offset: pageParam, limit: 50 } }),
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
) {
  return useQuery({
    queryKey: behaviourTrajectoryQueryKey(projectId, categoryClusterIds, axis),
    queryFn: () => getBehaviourTrajectory({ data: { projectId, categoryClusterIds: [...categoryClusterIds], axis } }),
    staleTime: 30_000,
    enabled: projectId.length > 0 && categoryClusterIds.length > 0,
  })
}

export function useProjectBehaviours({
  projectId,
  dimension,
  segment,
  sortBy,
}: {
  readonly projectId: string
  readonly dimension: BehaviourDimension
  readonly segment: BehaviourSegment
  readonly sortBy: BehaviourSortBy
}) {
  return useQuery({
    queryKey: projectBehavioursQueryKey({ projectId, dimension, segment, sortBy }),
    queryFn: () => getProjectBehaviours({ data: { projectId, dimension, segment, sortBy } }),
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
