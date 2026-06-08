import { applyDecay, type OrganizationId, type ProjectId, TaxonomyClusterId, type TaxonomyRunId } from "@domain/shared"
import { Effect } from "effect"
import {
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import { normalizeTaxonomyEmbedding } from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import {
  type ReassignTaxonomyObservationInput,
  TaxonomyObservationRepository,
} from "../ports/taxonomy-observation-repository.ts"
import { routeToDeepestClusterUseCase } from "./route-to-deepest-cluster.ts"

export interface ReassignNoiseToCurrentClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface ReassignNoiseToCurrentClustersResult {
  readonly noiseScanned: number
  readonly observationsReassigned: number
}

const ROUTE_CONCURRENCY = 4

const lookbackStart = (now: Date): Date => new Date(now.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

interface ClusterReassignAggregate {
  readonly clusterId: TaxonomyCluster["id"]
  assignedCount: number
  normalizedEmbeddingSum: Float64Array
  lastObservedAt: Date
}

const applyAggregateToCentroid = ({
  cluster,
  aggregate,
  now,
}: {
  readonly cluster: TaxonomyCluster
  readonly aggregate: ClusterReassignAggregate
  readonly now: Date
}): TaxonomyCluster["centroid"] => {
  if (cluster.centroid.base.length !== aggregate.normalizedEmbeddingSum.length) {
    throw new Error(
      `Dimension mismatch: centroid has ${cluster.centroid.base.length}, aggregate has ${aggregate.normalizedEmbeddingSum.length}`,
    )
  }

  const base = new Float32Array(cluster.centroid.base)
  const mass = applyDecay(base, cluster.centroid.mass, cluster.clusteredAt, now, cluster.centroid.decay)
  for (let index = 0; index < base.length; index++) {
    base[index] += aggregate.normalizedEmbeddingSum[index] ?? 0
  }

  return {
    ...cluster.centroid,
    base: Array.from(base),
    mass: mass + aggregate.assignedCount,
  }
}

/**
 * Routes recent noise back into the tree with the same deepest-fit descent
 * live assignment uses: each observation lands on the most specific node it
 * can defend instead of parking at a root and waiting for recursion to
 * redistribute it.
 */
export const reassignNoiseToCurrentClustersUseCase = (input: ReassignNoiseToCurrentClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const observations = yield* TaxonomyObservationRepository
    const clusters = yield* TaxonomyClusterRepository
    const since = lookbackStart(now)
    const noise = yield* observations.listNoise({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since,
      limit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
    })
    if (noise.length === 0) {
      return { noiseScanned: 0, observationsReassigned: 0 } satisfies ReassignNoiseToCurrentClustersResult
    }

    const decisions = yield* Effect.forEach(
      noise,
      (observation) =>
        Effect.gen(function* () {
          const normalized = normalizeTaxonomyEmbedding(observation.embedding)
          if (normalized.length === 0) return null
          const decision = yield* routeToDeepestClusterUseCase({
            projectId: input.projectId,
            dimension,
            queryVector: observation.embedding,
          })
          if (decision.method !== "centroid_online" || decision.clusterId === null) return null
          return { observation, normalized, decision }
        }),
      { concurrency: ROUTE_CONCURRENCY },
    )

    const reassignments: ReassignTaxonomyObservationInput[] = []
    const aggregates = new Map<string, ClusterReassignAggregate>()
    for (const entry of decisions) {
      if (entry === null) continue
      const clusterId = TaxonomyClusterId(entry.decision.clusterId)
      reassignments.push({
        observation: entry.observation,
        assignedClusterId: clusterId,
        assignmentMethod: "gardening_reassign",
        assignmentConfidence: entry.decision.confidence,
        reassignmentRunId: input.runId,
        indexedAt: now,
      })
      const aggregate = aggregates.get(clusterId) ?? {
        clusterId,
        assignedCount: 0,
        normalizedEmbeddingSum: new Float64Array(entry.normalized.length),
        lastObservedAt: entry.observation.startTime,
      }
      aggregate.assignedCount += 1
      for (let index = 0; index < entry.normalized.length; index++) {
        aggregate.normalizedEmbeddingSum[index] =
          (aggregate.normalizedEmbeddingSum[index] ?? 0) + (entry.normalized[index] ?? 0)
      }
      if (entry.observation.startTime > aggregate.lastObservedAt) {
        aggregate.lastObservedAt = entry.observation.startTime
      }
      aggregates.set(clusterId, aggregate)
    }

    yield* observations.reassignMany(reassignments)

    for (const aggregate of aggregates.values()) {
      yield* withTaxonomyClusterLock(
        {
          organizationId: input.organizationId,
          clusterId: aggregate.clusterId,
          ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
        },
        Effect.gen(function* () {
          const cluster = yield* clusters.findById(aggregate.clusterId)
          // Merged/deprecated mid-flight: writing the stale row back would
          // resurrect it. The CH rows stay where routing put them; the next
          // pass re-points them.
          if (cluster.state !== "active") return
          const centroid = applyAggregateToCentroid({ cluster, aggregate, now })
          yield* clusters.save({
            ...cluster,
            centroid,
            clusteredAt: now,
            observationCount: cluster.observationCount + aggregate.assignedCount,
            lastObservedAt:
              aggregate.lastObservedAt > cluster.lastObservedAt ? aggregate.lastObservedAt : cluster.lastObservedAt,
            updatedAt: now,
          })
        }),
      )
    }

    return {
      noiseScanned: noise.length,
      observationsReassigned: reassignments.length,
    } satisfies ReassignNoiseToCurrentClustersResult
  }).pipe(Effect.withSpan("taxonomy.reassignNoiseToCurrentClusters"))
