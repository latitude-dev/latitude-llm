import { Effect } from "effect"
import { TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX } from "../constants.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import type { TaxonomyObservationRepositoryShape } from "../ports/taxonomy-observation-repository.ts"

const observationKey = (organizationId: string, projectId: string, observationId: string): string =>
  `${organizationId}|${projectId}|${observationId}`

// Deterministic stand-in for ClickHouse's cityHash64 — only needs stable,
// well-distributed per-id ordering for the day-stratified clustering sample.
const deterministicHash = (value: string): number => {
  let hash = 0
  for (let index = 0; index < value.length; index++) {
    hash = (Math.imul(hash, 31) + value.charCodeAt(index)) >>> 0
  }
  return hash
}

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

    reassignManyById: ({ organizationId, projectId, assignments }) =>
      Effect.sync(() => {
        for (const {
          observationId,
          assignedClusterId,
          assignmentMethod,
          assignmentConfidence,
          reassignmentRunId,
          indexedAt,
        } of assignments) {
          const key = observationKey(organizationId, projectId, observationId)
          const existing = rows.get(key)
          if (!existing) continue
          setVersioned(key, {
            ...existing,
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

    listForClustering: ({ organizationId, projectId, since, limit }) =>
      Effect.sync(() => {
        // Mirror the day-stratified round-robin the ClickHouse repo runs: rank
        // each observation within its UTC day by a deterministic hash, then
        // interleave days (all rank-1s, then all rank-2s, …) up to `limit`.
        // Reads the full project history (not the newest-N window) so the
        // sample is representative of the whole lookback span, not the tail.
        const eligible = [...rows.values()].filter(
          (observation) =>
            observation.organizationId === organizationId &&
            observation.projectId === projectId &&
            observation.embedding.length > 0 &&
            observation.startTime >= since,
        )
        const dayBuckets = new Map<string, TaxonomyMomentObservation[]>()
        for (const observation of eligible) {
          const day = observation.startTime.toISOString().slice(0, 10)
          const bucket = dayBuckets.get(day) ?? []
          bucket.push(observation)
          dayBuckets.set(day, bucket)
        }
        const ranked = [...dayBuckets.values()].flatMap((bucket) =>
          [...bucket]
            .sort((a, b) => deterministicHash(a.observationId) - deterministicHash(b.observationId))
            .map((observation, rank) => ({ observation, rank })),
        )
        return ranked
          .sort((a, b) => a.rank - b.rank || a.observation.observationId.localeCompare(b.observation.observationId))
          .slice(0, limit)
          .map((entry) => entry.observation)
          .sort(
            (a, b) => b.startTime.getTime() - a.startTime.getTime() || a.observationId.localeCompare(b.observationId),
          )
      }),

    listForClusteringSample: ({ organizationId, projectId, since, limit }) =>
      Effect.sync(() => {
        const eligible = [...rows.values()].filter(
          (observation) =>
            observation.organizationId === organizationId &&
            observation.projectId === projectId &&
            observation.embedding.length > 0 &&
            observation.startTime >= since,
        )
        const dayBuckets = new Map<string, TaxonomyMomentObservation[]>()
        for (const observation of eligible) {
          const day = observation.startTime.toISOString().slice(0, 10)
          const bucket = dayBuckets.get(day) ?? []
          bucket.push(observation)
          dayBuckets.set(day, bucket)
        }
        const ranked = [...dayBuckets.values()].flatMap((bucket) =>
          [...bucket]
            .sort((a, b) => deterministicHash(a.observationId) - deterministicHash(b.observationId))
            .map((observation, rank) => ({ observation, rank })),
        )
        return ranked
          .sort((a, b) => a.rank - b.rank || a.observation.observationId.localeCompare(b.observation.observationId))
          .slice(0, limit)
          .map((entry) => entry.observation)
          .sort(
            (a, b) => b.startTime.getTime() - a.startTime.getTime() || a.observationId.localeCompare(b.observationId),
          )
          .map((observation) => ({
            observationId: observation.observationId,
            embedding: observation.embedding,
            startTime: observation.startTime,
          }))
      }),

    // The fake does not compile `filterSet` (session-filter compilation is
    // ClickHouse-specific and covered by the repository integration test); it
    // returns the same day-stratified sample as `listForClusteringSample`,
    // carrying each row's sessionId.
    listForCustomBehaviorSample: ({ organizationId, projectId, since, limit }) =>
      Effect.sync(() => {
        const eligible = [...rows.values()].filter(
          (observation) =>
            observation.organizationId === organizationId &&
            observation.projectId === projectId &&
            observation.embedding.length > 0 &&
            observation.startTime >= since,
        )
        const dayBuckets = new Map<string, TaxonomyMomentObservation[]>()
        for (const observation of eligible) {
          const day = observation.startTime.toISOString().slice(0, 10)
          const bucket = dayBuckets.get(day) ?? []
          bucket.push(observation)
          dayBuckets.set(day, bucket)
        }
        const ranked = [...dayBuckets.values()].flatMap((bucket) =>
          [...bucket]
            .sort((a, b) => deterministicHash(a.observationId) - deterministicHash(b.observationId))
            .map((observation, rank) => ({ observation, rank })),
        )
        return ranked
          .sort((a, b) => a.rank - b.rank || a.observation.observationId.localeCompare(b.observation.observationId))
          .slice(0, limit)
          .map((entry) => entry.observation)
          .sort(
            (a, b) => b.startTime.getTime() - a.startTime.getTime() || a.observationId.localeCompare(b.observationId),
          )
          .map((observation) => ({
            observationId: observation.observationId,
            sessionId: observation.sessionId,
            embedding: observation.embedding,
            startTime: observation.startTime,
          }))
      }),

    // Like listForCustomBehaviorSample, the fake does not compile `filterSet`;
    // it returns the unsampled eligible totals over the window.
    countForCustomBehaviorSample: ({ organizationId, projectId, since }) =>
      Effect.sync(() => {
        const sessions = new Set<string>()
        let observationCount = 0
        for (const observation of rows.values()) {
          if (
            observation.organizationId !== organizationId ||
            observation.projectId !== projectId ||
            observation.embedding.length === 0 ||
            observation.startTime < since
          ) {
            continue
          }
          observationCount++
          sessions.add(observation.sessionId)
        }
        return { observationCount, sessionCount: sessions.size }
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

    // The fake does not compile `filterSet` (session-filter compilation is
    // ClickHouse-specific); it returns the full newest-N live window as slim
    // reassignment rows carrying the current assignment.
    listWindowForReassignment: ({ organizationId, projectId, limit }) =>
      Effect.sync(() =>
        latestProjectWindow(organizationId, projectId)
          .filter((observation) => observation.embedding.length > 0)
          .slice(0, limit)
          .map((observation) => ({
            observationId: observation.observationId,
            sessionId: observation.sessionId,
            embedding: observation.embedding,
            startTime: observation.startTime,
            assignedClusterId: observation.assignedClusterId,
          })),
      ),

    getClusterCountsByUser: () => Effect.succeed([]),

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
