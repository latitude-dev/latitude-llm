import type { TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import type { TaxonomyViewAssignment } from "../entities/taxonomy-view-assignment.ts"
import type { TaxonomyViewAssignmentRepositoryShape } from "../ports/taxonomy-view-assignment-repository.ts"

export const createFakeTaxonomyViewAssignmentRepository = (
  /** Member observation rows returned by `listClusterMemberObservations`, keyed by cluster id. */
  membersByClusterId: Readonly<Record<string, readonly TaxonomyMomentObservation[]>> = {},
  overrides?: Partial<TaxonomyViewAssignmentRepositoryShape>,
) => {
  const assignments: TaxonomyViewAssignment[] = []
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

    getClusterAssignmentCounts: ({ customBehaviorId, startTimeFrom, startTimeTo }) =>
      Effect.sync(() => {
        const counts = new Map<string, number>()
        for (const assignment of assignments) {
          if (assignment.customBehaviorId !== customBehaviorId) continue
          if (assignment.assignedClusterId == null) continue
          if (startTimeFrom && assignment.startTime < startTimeFrom) continue
          if (startTimeTo && assignment.startTime >= startTimeTo) continue
          const key = assignment.assignedClusterId as string
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return [...counts].map(([clusterId, count]) => ({ clusterId: clusterId as TaxonomyClusterId, count }))
      }),

    getClusterTrendCounts: ({ customBehaviorId, clusterIds, currentSince, baselineSince, baselineDays }) =>
      Effect.sync(() => {
        const wanted = new Set(clusterIds.map((id) => id as string))
        const current = new Map<string, number>()
        const baseline = new Map<string, number>()
        for (const assignment of assignments) {
          if (assignment.customBehaviorId !== customBehaviorId) continue
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

    listClusterMemberObservations: ({ clusterId, limit }) =>
      Effect.sync(() => (members.get(clusterId as string) ?? []).slice(0, limit)),

    // Purge across BOTH lenses (no facet_id filter): deleting a cohort drops its
    // topic slice AND every facet-lens slice applied to it.
    deleteByBehavior: ({ customBehaviorId }) =>
      Effect.sync(() => {
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

  return { repository, assignments, members }
}
