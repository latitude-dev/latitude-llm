import type { TaxonomyClusterId } from "@domain/shared"
import { Effect } from "effect"
import type { CustomBehaviorAssignment } from "../entities/custom-behavior-assignment.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import type { CustomBehaviorAssignmentRepositoryShape } from "../ports/custom-behavior-assignment-repository.ts"

export const createFakeCustomBehaviorAssignmentRepository = (
  /** Member observation rows returned by `listClusterMemberObservations`, keyed by cluster id. */
  membersByClusterId: Readonly<Record<string, readonly TaxonomyMomentObservation[]>> = {},
  overrides?: Partial<CustomBehaviorAssignmentRepositoryShape>,
) => {
  const assignments: CustomBehaviorAssignment[] = []
  const members = new Map<string, readonly TaxonomyMomentObservation[]>(Object.entries(membersByClusterId))

  const repository: CustomBehaviorAssignmentRepositoryShape = {
    upsertMany: (rows) =>
      Effect.sync(() => {
        assignments.push(...rows)
      }),

    listByBehavior: ({ customBehaviorId, limit }) =>
      Effect.sync(() =>
        assignments.filter((assignment) => assignment.customBehaviorId === customBehaviorId).slice(0, limit),
      ),

    getClusterAssignmentCounts: ({ customBehaviorId }) =>
      Effect.sync(() => {
        const counts = new Map<string, number>()
        for (const assignment of assignments) {
          if (assignment.customBehaviorId !== customBehaviorId) continue
          const key = assignment.assignedClusterId as string
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
        return [...counts].map(([clusterId, count]) => ({ clusterId: clusterId as TaxonomyClusterId, count }))
      }),

    listClusterMemberObservations: ({ clusterId, limit }) =>
      Effect.sync(() => (members.get(clusterId as string) ?? []).slice(0, limit)),

    deleteByBehavior: ({ customBehaviorId }) =>
      Effect.sync(() => {
        for (let index = assignments.length - 1; index >= 0; index--) {
          if (assignments[index]?.customBehaviorId === customBehaviorId) assignments.splice(index, 1)
        }
      }),

    ...overrides,
  }

  return { repository, assignments, members }
}
