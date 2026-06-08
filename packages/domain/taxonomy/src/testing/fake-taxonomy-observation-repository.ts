import { Effect } from "effect"
import { TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX } from "../constants.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import type { TaxonomyObservationRepositoryShape } from "../ports/taxonomy-observation-repository.ts"

const observationKey = (organizationId: string, projectId: string, observationId: string): string =>
  `${organizationId}|${projectId}|${observationId}`

export const createFakeTaxonomyObservationRepository = (
  seed: readonly TaxonomyMomentObservation[] = [],
  overrides?: Partial<TaxonomyObservationRepositoryShape>,
) => {
  const rows = new Map<string, TaxonomyMomentObservation>(
    seed.map(
      (observation) =>
        [
          observationKey(observation.organizationId, observation.projectId, observation.observationId),
          observation,
        ] as const,
    ),
  )

  // ReplacingMergeTree(indexed_at) semantics: the row with the highest
  // version wins regardless of write order; an equal version is a TIE the
  // real table resolves arbitrarily — the fake keeps the existing row so
  // version-tie bugs surface as stale reads instead of passing silently.
  const setVersioned = (key: string, observation: TaxonomyMomentObservation) => {
    const existing = rows.get(key)
    if (existing && existing.indexedAt.getTime() >= observation.indexedAt.getTime()) return
    rows.set(key, observation)
  }

  const latestProjectWindow = (organizationId: string, projectId: string): TaxonomyMomentObservation[] =>
    [...rows.values()]
      .filter((observation) => observation.organizationId === organizationId && observation.projectId === projectId)
      .sort((a, b) => b.startTime.getTime() - a.startTime.getTime() || a.observationId.localeCompare(b.observationId))
      .slice(0, TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX)

  const repository: TaxonomyObservationRepositoryShape = {
    upsert: (observation) =>
      Effect.sync(() => {
        setVersioned(
          observationKey(observation.organizationId, observation.projectId, observation.observationId),
          observation,
        )
      }),

    upsertMany: (observations) =>
      Effect.sync(() => {
        for (const observation of observations) {
          setVersioned(
            observationKey(observation.organizationId, observation.projectId, observation.observationId),
            observation,
          )
        }
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
          setVersioned(observationKey(observation.organizationId, observation.projectId, observation.observationId), {
            ...observation,
            assignedClusterId,
            assignmentMethod,
            assignmentConfidence,
            reassignmentRunId,
            indexedAt,
          })
        }
      }),

    filterExistingIds: ({ organizationId, projectId, observationIds }) =>
      Effect.sync(() => {
        const requested = new Set(observationIds)
        return [...rows.values()]
          .filter(
            (row) =>
              row.organizationId === organizationId && row.projectId === projectId && requested.has(row.observationId),
          )
          .map((row) => row.observationId)
      }),

    listNoise: ({ organizationId, projectId, since, limit }) =>
      Effect.sync(() => {
        const filtered = latestProjectWindow(organizationId, projectId)
          .filter(
            (observation) =>
              observation.assignedClusterId === null &&
              observation.embedding.length > 0 &&
              observation.startTime >= since,
          )
          .sort(
            (a, b) => b.startTime.getTime() - a.startTime.getTime() || a.observationId.localeCompare(b.observationId),
          )
        return typeof limit === "number" ? filtered.slice(0, limit) : filtered
      }),

    listByCluster: ({ organizationId, projectId, clusterId, limit, beforeStartTime, beforeObservationId }) =>
      Effect.sync(() =>
        latestProjectWindow(organizationId, projectId)
          .filter((observation) => {
            if (observation.assignedClusterId !== clusterId) return false
            if (!beforeStartTime) return true
            if (observation.startTime < beforeStartTime) return true
            return beforeObservationId
              ? observation.startTime.getTime() === beforeStartTime.getTime() &&
                  observation.observationId > beforeObservationId
              : false
          })
          .sort(
            (a, b) => b.startTime.getTime() - a.startTime.getTime() || a.observationId.localeCompare(b.observationId),
          )
          .slice(0, limit),
      ),

    listAllByCluster: ({ organizationId, projectId, clusterId, limit }) =>
      Effect.sync(() =>
        latestProjectWindow(organizationId, projectId)
          .filter((observation) => observation.assignedClusterId === clusterId)
          .sort(
            (a, b) => b.startTime.getTime() - a.startTime.getTime() || a.observationId.localeCompare(b.observationId),
          )
          .slice(0, limit),
      ),

    listBySession: ({ organizationId, projectId, sessionId, analysisHash }) =>
      Effect.sync(() =>
        [...rows.values()]
          .filter(
            (observation) =>
              observation.organizationId === organizationId &&
              observation.projectId === projectId &&
              observation.sessionId === sessionId &&
              (analysisHash === undefined || observation.analysisHash === analysisHash),
          )
          .sort(
            (a, b) => a.startTime.getTime() - b.startTime.getTime() || a.observationId.localeCompare(b.observationId),
          ),
      ),

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
          ) {
            continue
          }
          total++
          if (observation.assignedClusterId === null) noise++
          else assigned++
        }
        return { total, assigned, noise }
      }),

    getTopClustersByOccurrence: ({ organizationId, projectId, since, limit }) =>
      Effect.sync(() => {
        const counts = new Map<string, number>()
        for (const observation of latestProjectWindow(organizationId, projectId)) {
          if (observation.startTime < since || observation.assignedClusterId === null) continue
          const clusterId = observation.assignedClusterId
          counts.set(clusterId, (counts.get(clusterId) ?? 0) + 1)
        }
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, limit)
          .map(([clusterId, count]) => ({ clusterId: clusterId as never, count }))
      }),

    getClusterAssignmentCounts: ({ organizationId, projectId, clusterIds, startTimeFrom, startTimeTo }) =>
      Effect.sync(() => {
        const requested = new Set(clusterIds)
        const counts = new Map<string, { count: number; firstObservedAt: Date; lastObservedAt: Date }>()
        for (const observation of latestProjectWindow(organizationId, projectId)) {
          if (
            observation.assignedClusterId === null ||
            !requested.has(observation.assignedClusterId) ||
            (startTimeFrom !== undefined && observation.startTime < startTimeFrom) ||
            (startTimeTo !== undefined && observation.startTime >= startTimeTo)
          ) {
            continue
          }
          const existing = counts.get(observation.assignedClusterId) ?? {
            count: 0,
            firstObservedAt: observation.startTime,
            lastObservedAt: observation.startTime,
          }
          counts.set(observation.assignedClusterId, {
            count: existing.count + 1,
            firstObservedAt:
              observation.startTime < existing.firstObservedAt ? observation.startTime : existing.firstObservedAt,
            lastObservedAt:
              observation.startTime > existing.lastObservedAt ? observation.startTime : existing.lastObservedAt,
          })
        }
        return [...counts.entries()].map(([clusterId, count]) => ({ clusterId: clusterId as never, ...count }))
      }),

    getClusterTrendCounts: ({ organizationId, projectId, clusterIds, currentSince, baselineSince, baselineDays }) =>
      Effect.sync(() =>
        clusterIds.map((clusterId) => {
          let currentCount = 0
          let baselineCount = 0
          for (const observation of latestProjectWindow(organizationId, projectId)) {
            if (observation.assignedClusterId !== clusterId || observation.startTime < baselineSince) continue
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
