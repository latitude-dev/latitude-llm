import type { CustomBehaviorId, TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import type { TaxonomyViewAssignment } from "../entities/taxonomy-view-assignment.ts"
import type { TaxonomyViewAssignmentRepositoryShape } from "../ports/taxonomy-view-assignment-repository.ts"

const utcDayStart = (date: Date): number => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())

export const createFakeTaxonomyViewAssignmentRepository = (
  /** Member observation rows returned by `listClusterMemberObservations`, keyed by cluster id. */
  membersByClusterId: Readonly<Record<string, readonly TaxonomyMomentObservation[]>> = {},
  overrides?: Partial<TaxonomyViewAssignmentRepositoryShape>,
) => {
  const assignments: TaxonomyViewAssignment[] = []
  // Purges are asserted on directly: an empty slice is indistinguishable from one that was never purged.
  const deletedBehaviorIds: CustomBehaviorId[] = []
  const members = new Map<string, readonly TaxonomyMomentObservation[]>(Object.entries(membersByClusterId))

  const repository: TaxonomyViewAssignmentRepositoryShape = {
    upsertMany: (rows) =>
      Effect.sync(() => {
        assignments.push(...rows)
      }),

    listByBehavior: ({ customBehaviorId, limit }) =>
      Effect.sync(() =>
        assignments.filter((assignment) => assignment.customBehaviorId === customBehaviorId).slice(0, limit),
      ),

    // The topic slice is `facet_id = ''` in ClickHouse, so both a null and an empty
    // facet id name it; normalize before comparing or a row stored the storage way
    // drops out of a topic-scoped read here but not in the live repository.
    getClusterAssignmentCounts: ({ customBehaviorId, facetId, startTimeFrom, startTimeTo }) =>
      Effect.sync(() => {
        const counts = new Map<string, number>()
        for (const assignment of assignments) {
          if (assignment.customBehaviorId !== customBehaviorId) continue
          if ((assignment.facetId ?? "") !== (facetId ?? "")) continue
          if (assignment.assignedClusterId == null) continue
          if (startTimeFrom && assignment.startTime < startTimeFrom) continue
          if (startTimeTo && assignment.startTime >= startTimeTo) continue
          const key = assignment.assignedClusterId as string
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return [...counts].map(([clusterId, count]) => ({ clusterId: clusterId as TaxonomyClusterId, count }))
      }),

    getClusterTrendCounts: ({ customBehaviorId, facetId, clusterIds, currentSince, baselineSince, baselineDays }) =>
      Effect.sync(() => {
        const wanted = new Set(clusterIds.map((id) => id as string))
        const current = new Map<string, number>()
        const baseline = new Map<string, number>()
        for (const assignment of assignments) {
          if (assignment.customBehaviorId !== customBehaviorId) continue
          if ((assignment.facetId ?? "") !== (facetId ?? "")) continue
          const key = assignment.assignedClusterId as string
          if (!wanted.has(key)) continue
          if (assignment.startTime >= currentSince) current.set(key, (current.get(key) ?? 0) + 1)
          else if (assignment.startTime >= baselineSince) baseline.set(key, (baseline.get(key) ?? 0) + 1)
        }
        return clusterIds.map((clusterId) => ({
          clusterId,
          currentCount: current.get(clusterId as string) ?? 0,
          baselineCount: baseline.get(clusterId as string) ?? 0,
          baselineDays,
        }))
      }),

    getAssignedCountsByDay: ({ customBehaviorId, facetId, clusterIds, since }) =>
      Effect.sync(() => {
        const wanted = new Set(clusterIds.map((id) => id as string))
        const counts = new Map<number, number>()
        for (const assignment of assignments) {
          if (assignment.customBehaviorId !== customBehaviorId) continue
          if ((assignment.facetId ?? "") !== (facetId ?? "")) continue
          if (assignment.assignedClusterId == null || !wanted.has(assignment.assignedClusterId as string)) continue
          if (assignment.startTime < since) continue
          const day = utcDayStart(assignment.startTime)
          counts.set(day, (counts.get(day) ?? 0) + 1)
        }
        return [...counts]
          .sort(([left], [right]) => left - right)
          .map(([day, count]) => ({ day: new Date(day), count }))
      }),

    listClusterMemberObservations: ({ clusterId, limit }) =>
      Effect.sync(() => (members.get(clusterId as string) ?? []).slice(0, limit)),

    // Purge across BOTH the topic and facet edges (no facet_id filter), matching the real repo.
    deleteByBehavior: ({ customBehaviorId }) =>
      Effect.sync(() => {
        deletedBehaviorIds.push(customBehaviorId)
        for (let index = assignments.length - 1; index >= 0; index--) {
          if (assignments[index]?.customBehaviorId === customBehaviorId) assignments.splice(index, 1)
        }
      }),

    deleteByFacet: ({ facetId }) =>
      Effect.sync(() => {
        for (let index = assignments.length - 1; index >= 0; index--) {
          if (assignments[index]?.facetId === facetId) assignments.splice(index, 1)
        }
      }),

    ...overrides,
  }

  return { repository, assignments, members, deletedBehaviorIds }
}
