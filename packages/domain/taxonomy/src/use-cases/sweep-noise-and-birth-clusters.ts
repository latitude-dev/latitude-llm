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
  TAXONOMY_BIRTH_LINK_THRESHOLD,
  TAXONOMY_BIRTH_MAX_DIAMETER,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
  TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  TAXONOMY_VISIBLE_BIRTH_MIN_OBSERVATION_RATIO,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import {
  createTaxonomyCentroid,
  diameterBoundedGreedyClusters,
  meanNormalized,
  normalizeTaxonomyEmbedding,
  updateTaxonomyCentroid,
} from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

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

const computeVisibleBirthMinMembers = (samplePoolSize: number): number =>
  Math.max(
    TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
    Math.ceil(samplePoolSize * TAXONOMY_VISIBLE_BIRTH_MIN_OBSERVATION_RATIO),
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
      limit: Math.min(TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX, TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX),
    })

    if (noise.length < TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS) {
      return {
        noiseScanned: noise.length,
        clustersBorn: 0,
        observationsAbsorbed: 0,
        lineage: [],
      } satisfies SweepNoiseAndBirthClustersResult
    }

    const counts = yield* observations.getCounts({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since: lookbackStart(now),
    })
    const observationSampleSize = Math.min(counts.total, TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX)
    const normalizedEmbeddings = noise.map((observation) => normalizeTaxonomyEmbedding(observation.embedding))
    const minMembers = computeVisibleBirthMinMembers(observationSampleSize)
    const candidates = diameterBoundedGreedyClusters({
      embeddings: normalizedEmbeddings,
      connectivityThreshold: TAXONOMY_BIRTH_LINK_THRESHOLD,
      minMembers,
      maxDiameter: TAXONOMY_BIRTH_MAX_DIAMETER,
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
        observationsAbsorbed += memberObservations.length
        continue
      }

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
