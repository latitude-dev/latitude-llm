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
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_CEILING,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_RATIO,
  TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import {
  clamp,
  createTaxonomyCentroid,
  meanNormalized,
  normalizeTaxonomyEmbedding,
  singleLinkageClusters,
  updateTaxonomyCentroid,
} from "../helpers.ts"
import { BehaviorObservationRepository } from "../ports/behavior-observation-repository.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"

export interface SweepNoiseAndBirthClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
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
    parentCategoryId: null,
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
    const observations = yield* BehaviorObservationRepository
    const clusters = yield* TaxonomyClusterRepository
    const noise = yield* observations.listNoise({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since: lookbackStart(now),
    })

    if (noise.length < TAXONOMY_NOISE_BIRTH_MIN_OBSERVATIONS) {
      return {
        noiseScanned: noise.length,
        clustersBorn: 0,
        observationsAbsorbed: 0,
        lineage: [],
      } satisfies SweepNoiseAndBirthClustersResult
    }

    const normalizedEmbeddings = noise.map((observation) => normalizeTaxonomyEmbedding(observation.embedding))
    const minMembers = computeBirthMinMembers(noise.length)
    const candidates = singleLinkageClusters({
      embeddings: normalizedEmbeddings,
      connectivityThreshold: TAXONOMY_BIRTH_LINK_THRESHOLD,
      minMembers,
      maxDiameter: TAXONOMY_BIRTH_MAX_DIAMETER,
    })

    let clustersBorn = 0
    let observationsAbsorbed = 0
    const lineage: TaxonomyClusterLineage[] = []

    for (const candidate of candidates) {
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
        queryVector: candidateCentroid,
        k: 1,
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
