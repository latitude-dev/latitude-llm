import { Effect } from "effect"
import type { TaxonomyObservation } from "../entities/observation.ts"
import type { BehaviorObservationRepositoryShape } from "../ports/behavior-observation-repository.ts"

const observationKey = (organizationId: string, projectId: string, sessionId: string): string =>
  `${organizationId}|${projectId}|${sessionId}`

export const createFakeBehaviorObservationRepository = (
  seed: readonly TaxonomyObservation[] = [],
  overrides?: Partial<BehaviorObservationRepositoryShape>,
) => {
  const rows = new Map<string, TaxonomyObservation>(
    seed.map(
      (observation) =>
        [
          observationKey(observation.organizationId, observation.projectId, observation.sessionId),
          observation,
        ] as const,
    ),
  )

  const repository: BehaviorObservationRepositoryShape = {
    upsert: (observation) =>
      Effect.sync(() => {
        rows.set(observationKey(observation.organizationId, observation.projectId, observation.sessionId), observation)
      }),

    reassignMany: (inputs) =>
      Effect.sync(() => {
        for (const {
          observation,
          assignedClusterId,
          assignmentMethod,
          assignmentConfidence,
          reassignmentRunId,
          indexedAt,
        } of inputs) {
          rows.set(observationKey(observation.organizationId, observation.projectId, observation.sessionId), {
            ...observation,
            assignedClusterId,
            assignmentMethod,
            assignmentConfidence,
            reassignmentRunId,
            indexedAt,
          })
        }
      }),

    listNoise: ({ organizationId, projectId, since, limit }) =>
      Effect.sync(() => {
        const filtered = [...rows.values()]
          .filter(
            (observation) =>
              observation.organizationId === organizationId &&
              observation.projectId === projectId &&
              observation.assignedClusterId === null &&
              observation.embedding.length > 0 &&
              observation.startTime >= since,
          )
          .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())
        return typeof limit === "number" ? filtered.slice(0, limit) : filtered
      }),

    listByCluster: ({ organizationId, projectId, clusterId, limit, beforeStartTime, beforeSessionId }) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter((observation) => {
            if (
              observation.organizationId !== organizationId ||
              observation.projectId !== projectId ||
              observation.assignedClusterId !== clusterId
            )
              return false
            if (!beforeStartTime) return true
            if (observation.startTime < beforeStartTime) return true
            return beforeSessionId
              ? observation.startTime.getTime() === beforeStartTime.getTime() && observation.sessionId > beforeSessionId
              : false
          })
          .sort((a, b) => b.startTime.getTime() - a.startTime.getTime() || a.sessionId.localeCompare(b.sessionId))
          .slice(0, limit),
      ),

    listAllByCluster: ({ organizationId, projectId, clusterId, limit }) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter(
            (observation) =>
              observation.organizationId === organizationId &&
              observation.projectId === projectId &&
              observation.assignedClusterId === clusterId,
          )
          .sort((a, b) => b.startTime.getTime() - a.startTime.getTime() || a.sessionId.localeCompare(b.sessionId))
          .slice(0, limit),
      ),

    findBySummaryHash: ({ organizationId, projectId, sessionId, summaryHash }) =>
      Effect.sync(() => {
        const observation = rows.get(observationKey(organizationId, projectId, sessionId))
        if (!observation) return null
        return observation.summaryHash === summaryHash ? observation : null
      }),

    getCounts: ({ organizationId, projectId, since }) =>
      Effect.sync(() => {
        let total = 0
        let assigned = 0
        let noise = 0
        for (const observation of rows.values()) {
          if (
            observation.organizationId !== organizationId ||
            observation.projectId !== projectId ||
            observation.startTime < since
          )
            continue
          total++
          if (observation.assignedClusterId === null) noise++
          else assigned++
        }
        return { total, assigned, noise }
      }),

    getTopClustersByOccurrence: ({ organizationId, projectId, since, limit }) =>
      Effect.sync(() => {
        const counts = new Map<string, number>()
        for (const observation of rows.values()) {
          if (
            observation.organizationId !== organizationId ||
            observation.projectId !== projectId ||
            observation.startTime < since ||
            observation.assignedClusterId === null
          )
            continue
          const clusterId = observation.assignedClusterId
          counts.set(clusterId, (counts.get(clusterId) ?? 0) + 1)
        }
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, limit)
          .map(([clusterId, count]) => ({ clusterId: clusterId as never, count }))
      }),

    getClusterTrendCounts: ({ organizationId, projectId, clusterIds, currentSince, baselineSince, baselineDays }) =>
      Effect.sync(() =>
        clusterIds.map((clusterId) => {
          let currentCount = 0
          let baselineCount = 0
          for (const observation of rows.values()) {
            if (
              observation.organizationId !== organizationId ||
              observation.projectId !== projectId ||
              observation.assignedClusterId !== clusterId ||
              observation.startTime < baselineSince
            )
              continue
            if (observation.startTime >= currentSince) currentCount++
            else baselineCount++
          }
          return { clusterId, currentCount, baselineCount, baselineDays }
        }),
      ),

    ...overrides,
  }

  return { repository, rows }
}
