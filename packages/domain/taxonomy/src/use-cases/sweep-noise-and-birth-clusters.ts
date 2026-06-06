import {
  generateId,
  type OrganizationId,
  type ProjectId,
  TaxonomyClusterId,
  TaxonomyLineageId,
  type TaxonomyRunId,
} from "@domain/shared"
import { Effect } from "effect"
import {
  TAXONOMY_ABSORPTION_THRESHOLD,
  TAXONOMY_BIRTH_LINK_PRESSURE_RANGE,
  TAXONOMY_CALIBRATION_DIAMETER_FACTOR,
  TAXONOMY_CALIBRATION_DIAMETER_MAX,
  TAXONOMY_CALIBRATION_DIAMETER_MIN,
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_CEILING,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_RATIO,
  TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  TAXONOMY_TREE_ROOT_CAP,
  TAXONOMY_TREE_ROOT_LINK_THRESHOLD,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import {
  clamp,
  createTaxonomyCentroid,
  diameterBoundedGreedyClusters,
  meanNormalized,
  normalizeTaxonomyEmbedding,
  updateTaxonomyCentroid,
} from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"
import { loadClusteringCalibration } from "./load-calibration.ts"

export interface SweepNoiseAndBirthClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface SweepNoiseAndBirthClustersResult {
  readonly noiseScanned: number
  readonly clustersBorn: number
  readonly observationsAbsorbed: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

const lookbackStart = (now: Date): Date => new Date(now.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

export const computeBirthMinMembers = (noisePoolSize: number): number =>
  clamp(
    Math.round(noisePoolSize * TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_RATIO),
    TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
    TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_CEILING,
  )

const buildBornCluster = (input: {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly memberEmbeddings: readonly (readonly number[])[]
  readonly memberStartTimes: readonly Date[]
  readonly dimension: TaxonomyDimensionType
  readonly now: Date
}): TaxonomyCluster => {
  let centroid = createTaxonomyCentroid()
  let clusteredAt = input.now
  for (let index = 0; index < input.memberEmbeddings.length; index++) {
    const timestamp = input.memberStartTimes[index] ?? input.now
    const updated = updateTaxonomyCentroid({
      centroid: { ...centroid, clusteredAt },
      embedding: input.memberEmbeddings[index] ?? [],
      weight: 1,
      timestamp,
      operation: "add",
      previousClusteredAt: clusteredAt,
    })
    const { clusteredAt: nextClusteredAt, ...nextCentroid } = updated
    centroid = nextCentroid
    clusteredAt = nextClusteredAt
  }

  const sortedTimes = [...input.memberStartTimes].sort((a, b) => a.getTime() - b.getTime())
  return {
    id: TaxonomyClusterId(generateId()),
    organizationId: input.organizationId,
    projectId: input.projectId,
    dimension: input.dimension,
    parentClusterId: null,
    depth: 0,
    path: "",
    splitLinkThreshold: null,
    name: "Pending",
    description: "",
    centroid,
    observationCount: input.memberEmbeddings.length,
    state: "active",
    mergedIntoClusterId: null,
    firstObservedAt: sortedTimes[0] ?? input.now,
    lastObservedAt: sortedTimes[sortedTimes.length - 1] ?? input.now,
    clusteredAt,
    createdAt: input.now,
    updatedAt: input.now,
  }
}

export const sweepNoiseAndBirthClustersUseCase = (input: SweepNoiseAndBirthClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const observations = yield* TaxonomyObservationRepository
    const clusters = yield* TaxonomyClusterRepository
    const noise = yield* observations.listNoise({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since: lookbackStart(now),
      limit: TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
    })

    if (noise.length < TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS) {
      return {
        noiseScanned: noise.length,
        clustersBorn: 0,
        observationsAbsorbed: 0,
        lineage: [],
      } satisfies SweepNoiseAndBirthClustersResult
    }

    // Noise births create ROOT nodes — the coarsest density level of the
    // tree (the old "category" altitude). Children are grown by the recursion
    // pass at tighter, per-node densities. Governor: as roots approach the
    // root cap, births require denser candidates; at the cap only absorption
    // into existing roots runs.
    const rootClusters = yield* clusters.listActiveByProject({
      projectId: input.projectId,
      dimension,
      parentClusterId: null,
    })
    const headroom = Math.max(0, TAXONOMY_TREE_ROOT_CAP - rootClusters.length)
    const densityPressure = Math.min(1, rootClusters.length / TAXONOMY_TREE_ROOT_CAP)

    const calibration = yield* loadClusteringCalibration({ projectId: input.projectId })
    const birthLink = calibration?.rootLinkThreshold ?? TAXONOMY_TREE_ROOT_LINK_THRESHOLD
    // The diameter bound follows the link density actually used for root
    // births; the calibrated birthMaxDiameter derives from the (tighter)
    // legacy birth link and would quietly override the coarse root density.
    const maxDiameter = clamp(
      (1 - birthLink) * TAXONOMY_CALIBRATION_DIAMETER_FACTOR,
      TAXONOMY_CALIBRATION_DIAMETER_MIN,
      TAXONOMY_CALIBRATION_DIAMETER_MAX,
    )
    const normalizedEmbeddings = noise.map((observation) => normalizeTaxonomyEmbedding(observation.embedding))
    const minMembers = Math.min(noise.length, Math.round(computeBirthMinMembers(noise.length) * (1 + densityPressure)))
    const candidates = diameterBoundedGreedyClusters({
      embeddings: normalizedEmbeddings,
      connectivityThreshold: birthLink + densityPressure * TAXONOMY_BIRTH_LINK_PRESSURE_RANGE,
      minMembers,
      maxDiameter,
    })

    let clustersBorn = 0
    let observationsAbsorbed = 0
    const lineage: TaxonomyClusterLineage[] = []

    // Largest candidates first so limited headroom goes to the most
    // significant behaviours.
    const orderedCandidates = [...candidates].sort((a, b) => b.members.length - a.members.length)

    for (const candidate of orderedCandidates) {
      // Pull from the pre-normalized pool instead of re-normalizing each member's
      // raw embedding — `candidate.members` indexes the same arrays.
      const memberObservations: (typeof noise)[number][] = []
      const memberEmbeddings: (readonly number[])[] = []
      for (const memberIndex of candidate.members) {
        const observation = noise[memberIndex]
        const embedding = normalizedEmbeddings[memberIndex]
        if (!observation || !embedding) continue
        memberObservations.push(observation)
        memberEmbeddings.push(embedding)
      }
      const candidateCentroid = meanNormalized(memberEmbeddings)
      if (candidateCentroid.length === 0) continue

      const nearest = yield* clusters.listNearestActive({
        projectId: input.projectId,
        dimension,
        queryVector: candidateCentroid,
        k: 1,
        parentClusterId: null,
      })
      const absorbingCluster = nearest[0]?.cosine >= TAXONOMY_ABSORPTION_THRESHOLD ? nearest[0].cluster : null

      if (absorbingCluster) {
        yield* observations.reassignMany(
          memberObservations.map((observation) => ({
            observation,
            assignedClusterId: absorbingCluster.id,
            assignmentMethod: "gardening_reassign",
            assignmentConfidence: nearest[0]?.cosine ?? 0,
            reassignmentRunId: input.runId,
            indexedAt: now,
          })),
        )
        // Keep the stored counter in step with the rows that now point at the
        // absorbing root; a stale counter later corrupts recursion residue.
        yield* withTaxonomyClusterLock(
          {
            organizationId: input.organizationId,
            clusterId: absorbingCluster.id,
            ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
          },
          Effect.gen(function* () {
            const fresh = yield* clusters.findById(absorbingCluster.id)
            const lastObservedAt = memberObservations.reduce(
              (latest, observation) => (observation.startTime > latest ? observation.startTime : latest),
              fresh.lastObservedAt,
            )
            yield* clusters.save({
              ...fresh,
              observationCount: fresh.observationCount + memberObservations.length,
              lastObservedAt,
              updatedAt: now,
            })
          }),
        )
        observationsAbsorbed += memberObservations.length
        continue
      }

      // Absorption above still runs at the cap; only new clusters are gated.
      if (clustersBorn >= headroom) continue

      const bornCluster = buildBornCluster({
        organizationId: input.organizationId,
        projectId: input.projectId,
        memberEmbeddings,
        memberStartTimes: memberObservations.map((observation) => observation.startTime),
        dimension,
        now,
      })
      yield* clusters.save(bornCluster)
      yield* observations.reassignMany(
        memberObservations.map((observation) => ({
          observation,
          assignedClusterId: bornCluster.id,
          assignmentMethod: "gardening_birth",
          assignmentConfidence: 1,
          reassignmentRunId: input.runId,
          indexedAt: now,
        })),
      )
      clustersBorn++
      lineage.push({
        id: TaxonomyLineageId(generateId()),
        organizationId: input.organizationId,
        projectId: input.projectId,
        dimension,
        runId: input.runId,
        transitionType: "birth",
        fromClusterIds: [],
        toClusterIds: [bornCluster.id],
        similarity: null,
        createdAt: now,
      })
    }

    return {
      noiseScanned: noise.length,
      clustersBorn,
      observationsAbsorbed,
      lineage,
    } satisfies SweepNoiseAndBirthClustersResult
  }).pipe(Effect.withSpan("taxonomy.sweepNoiseAndBirthClusters"))
