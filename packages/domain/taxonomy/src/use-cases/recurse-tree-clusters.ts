import type { TaxonomyRunId } from "@domain/shared"
import { generateId, type OrganizationId, type ProjectId, TaxonomyClusterId, TaxonomyLineageId } from "@domain/shared"
import { Effect } from "effect"
import {
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_MERGE_THRESHOLD,
  TAXONOMY_TREE_CHILD_DIAMETER_FACTOR,
  TAXONOMY_TREE_CHILD_DIAMETER_MAX,
  TAXONOMY_TREE_CHILD_DIAMETER_MIN,
  TAXONOMY_TREE_CHILD_LINK_MAX,
  TAXONOMY_TREE_CHILD_LINK_MIN,
  TAXONOMY_TREE_CHILD_LINK_QUANTILE,
  TAXONOMY_TREE_CHILDREN_CAP,
  TAXONOMY_TREE_DEEP_MAX_CHILD_DOMINANCE,
  TAXONOMY_TREE_MAX_CHILD_DOMINANCE,
  TAXONOMY_TREE_MAX_DEPTH,
  TAXONOMY_TREE_MIN_CHILDREN,
  TAXONOMY_TREE_MIN_COVERAGE,
  TAXONOMY_TREE_RECURSE_MIN_OBSERVATIONS,
  TAXONOMY_TREE_RECURSE_PER_RUN,
  TAXONOMY_VISIBLE_BIRTH_MIN_OBSERVATION_RATIO,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import {
  clamp,
  cosineSimilarityNormalized,
  createTaxonomyCentroid,
  diameterBoundedGreedyClusters,
  normalizeTaxonomyCentroid,
  normalizeTaxonomyEmbedding,
  quantileSorted,
  updateTaxonomyCentroid,
} from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import {
  type ReassignTaxonomyObservationInput,
  TaxonomyObservationRepository,
  type TaxonomyObservationRepositoryShape,
} from "../ports/taxonomy-observation-repository.ts"

const TAXONOMY_CLUSTER_STREAM_PAGE_SIZE = 5_000

export interface RecurseTreeClustersInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface RecurseTreeClustersResult {
  readonly nodesRecursed: number
  readonly childrenBorn: number
  readonly observationsMoved: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

const meanNormalizedEmbedding = (embeddings: readonly (readonly number[])[]): readonly number[] => {
  const dimensions = embeddings[0]?.length ?? 0
  if (dimensions === 0) return []
  const sum = Array.from({ length: dimensions }, () => 0)
  for (const embedding of embeddings) {
    for (let index = 0; index < dimensions; index++) {
      sum[index] = (sum[index] ?? 0) + (embedding[index] ?? 0)
    }
  }
  return normalizeTaxonomyEmbedding(sum)
}

interface SampledParentMember {
  readonly observation: TaxonomyMomentObservation
  readonly normalized: readonly number[]
  readonly parentSimilarity: number
}

interface ProposalSampleResult {
  readonly sample: readonly SampledParentMember[]
  readonly totalMembers: number
}

interface ChildAssignmentAggregate {
  count: number
  centroid: TaxonomyCluster["centroid"]
  clusteredAt: Date
  firstObservedAt: Date | null
  lastObservedAt: Date | null
}

const pruneBySimilarity = (members: SampledParentMember[], keep: number, direction: "closest" | "farthest") => {
  members.sort((a, b) =>
    direction === "closest"
      ? b.parentSimilarity - a.parentSimilarity ||
        a.observation.observationId.localeCompare(b.observation.observationId)
      : a.parentSimilarity - b.parentSimilarity ||
        a.observation.observationId.localeCompare(b.observation.observationId),
  )
  members.length = Math.min(members.length, keep)
}

const addReservoirSample = <T>(sample: T[], item: T, seen: number, limit: number) => {
  if (sample.length < limit) {
    sample.push(item)
    return
  }
  const replacementIndex = Math.floor(Math.random() * seen)
  if (replacementIndex < limit) sample[replacementIndex] = item
}

const selectProposalMembers = (input: {
  readonly closest: readonly SampledParentMember[]
  readonly farthest: readonly SampledParentMember[]
  readonly random: readonly SampledParentMember[]
}): readonly SampledParentMember[] => {
  const perBand = Math.ceil(TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX / 3)
  const selected = new Map<string, SampledParentMember>()
  for (const member of input.closest.slice(0, perBand)) selected.set(member.observation.observationId, member)
  for (const member of input.farthest) {
    if (selected.size >= perBand * 2) break
    selected.set(member.observation.observationId, member)
  }
  for (const member of input.random) {
    if (selected.size >= TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX) break
    selected.set(member.observation.observationId, member)
  }
  return [...selected.values()].sort(
    (a, b) =>
      b.observation.startTime.getTime() - a.observation.startTime.getTime() ||
      a.observation.observationId.localeCompare(b.observation.observationId),
  )
}

const sampleParentMembers = (input: {
  readonly observations: TaxonomyObservationRepositoryShape
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly node: TaxonomyCluster
}) =>
  Effect.gen(function* () {
    const parentCentroid = normalizeTaxonomyCentroid(input.node.centroid)
    const perBand = Math.ceil(TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX / 3)
    const bufferLimit = perBand * 4
    const closest: SampledParentMember[] = []
    const farthest: SampledParentMember[] = []
    const random: SampledParentMember[] = []
    let totalMembers = 0
    let beforeStartTime: Date | undefined
    let beforeObservationId: string | undefined

    while (true) {
      const page = yield* input.observations.listByCluster({
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: input.node.id,
        limit: TAXONOMY_CLUSTER_STREAM_PAGE_SIZE,
        ...(beforeStartTime && beforeObservationId ? { beforeStartTime, beforeObservationId } : {}),
      })
      if (page.length === 0) break

      for (const observation of page) {
        const normalized = normalizeTaxonomyEmbedding(observation.embedding)
        if (normalized.length === 0) continue
        totalMembers++
        const member = {
          observation,
          normalized,
          parentSimilarity: cosineSimilarityNormalized(normalized, parentCentroid),
        } satisfies SampledParentMember
        closest.push(member)
        farthest.push(member)
        addReservoirSample(random, member, totalMembers, TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX)
      }

      if (closest.length > bufferLimit) pruneBySimilarity(closest, perBand, "closest")
      if (farthest.length > bufferLimit) pruneBySimilarity(farthest, perBand, "farthest")

      const last = page[page.length - 1]
      if (!last || page.length < TAXONOMY_CLUSTER_STREAM_PAGE_SIZE) break
      beforeStartTime = last.startTime
      beforeObservationId = last.observationId
    }

    pruneBySimilarity(closest, perBand, "closest")
    pruneBySimilarity(farthest, perBand, "farthest")
    return {
      sample:
        totalMembers <= TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX
          ? random.sort(
              (a, b) =>
                b.observation.startTime.getTime() - a.observation.startTime.getTime() ||
                a.observation.observationId.localeCompare(b.observation.observationId),
            )
          : selectProposalMembers({ closest, farthest, random }),
      totalMembers,
    } satisfies ProposalSampleResult
  })

const findBestGroup = (input: {
  readonly embedding: readonly number[]
  readonly centroids: readonly (readonly number[])[]
  readonly minimumSimilarity: number
}): { readonly groupIndex: number; readonly similarity: number } | null => {
  let bestGroup = -1
  let bestSimilarity = Number.NEGATIVE_INFINITY
  for (let groupIndex = 0; groupIndex < input.centroids.length; groupIndex++) {
    const centroid = input.centroids[groupIndex]
    if (!centroid || centroid.length === 0) continue
    const similarity = cosineSimilarityNormalized(input.embedding, centroid)
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity
      bestGroup = groupIndex
    }
  }
  if (bestGroup < 0 || bestSimilarity < input.minimumSimilarity) return null
  return { groupIndex: bestGroup, similarity: bestSimilarity }
}

const emptyAssignmentAggregate = (now: Date): ChildAssignmentAggregate => ({
  count: 0,
  centroid: createTaxonomyCentroid(),
  clusteredAt: now,
  firstObservedAt: null,
  lastObservedAt: null,
})

const addToAggregate = (
  aggregate: ChildAssignmentAggregate,
  observation: TaxonomyMomentObservation,
  normalized: readonly number[],
) => {
  const updated = updateTaxonomyCentroid({
    centroid: { ...aggregate.centroid, clusteredAt: aggregate.clusteredAt },
    embedding: normalized,
    weight: 1,
    timestamp: observation.startTime,
    operation: "add",
    previousClusteredAt: aggregate.clusteredAt,
  })
  const { clusteredAt, ...centroid } = updated
  aggregate.centroid = centroid
  aggregate.clusteredAt = clusteredAt
  aggregate.count += 1
  aggregate.firstObservedAt =
    aggregate.firstObservedAt === null || observation.startTime < aggregate.firstObservedAt
      ? observation.startTime
      : aggregate.firstObservedAt
  aggregate.lastObservedAt =
    aggregate.lastObservedAt === null || observation.startTime > aggregate.lastObservedAt
      ? observation.startTime
      : aggregate.lastObservedAt
}

const collectAssignmentSupport = (input: {
  readonly observations: TaxonomyObservationRepositoryShape
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly node: TaxonomyCluster
  readonly groupCentroids: readonly (readonly number[])[]
  readonly childLink: number
  readonly now: Date
}) =>
  Effect.gen(function* () {
    const aggregates = input.groupCentroids.map(() => emptyAssignmentAggregate(input.now))
    let assignedCount = 0
    let beforeStartTime: Date | undefined
    let beforeObservationId: string | undefined

    while (true) {
      const page = yield* input.observations.listByCluster({
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: input.node.id,
        limit: TAXONOMY_CLUSTER_STREAM_PAGE_SIZE,
        ...(beforeStartTime && beforeObservationId ? { beforeStartTime, beforeObservationId } : {}),
      })
      if (page.length === 0) break

      for (const observation of page) {
        const normalized = normalizeTaxonomyEmbedding(observation.embedding)
        if (normalized.length === 0) continue
        const assignment = findBestGroup({
          embedding: normalized,
          centroids: input.groupCentroids,
          minimumSimilarity: input.childLink,
        })
        if (assignment === null) continue
        const aggregate = aggregates[assignment.groupIndex]
        if (!aggregate) continue
        addToAggregate(aggregate, observation, normalized)
        assignedCount++
      }

      const last = page[page.length - 1]
      if (!last || page.length < TAXONOMY_CLUSTER_STREAM_PAGE_SIZE) break
      beforeStartTime = last.startTime
      beforeObservationId = last.observationId
    }

    return { aggregates, assignedCount }
  })

const hasNearDuplicateChildCentroids = (aggregates: readonly ChildAssignmentAggregate[]): boolean => {
  const centroids = aggregates.map((aggregate) => normalizeTaxonomyCentroid(aggregate.centroid))
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      const left = centroids[i]
      const right = centroids[j]
      if (!left || !right) continue
      if (cosineSimilarityNormalized(left, right) >= TAXONOMY_MERGE_THRESHOLD) return true
    }
  }
  return false
}

const reassignValidChildren = (input: {
  readonly observations: TaxonomyObservationRepositoryShape
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly node: TaxonomyCluster
  readonly groupCentroids: readonly (readonly number[])[]
  readonly childIdsByGroup: ReadonlyMap<number, TaxonomyCluster["id"]>
  readonly childLink: number
  readonly now: Date
}) =>
  Effect.gen(function* () {
    let moved = 0
    let batch: ReassignTaxonomyObservationInput[] = []
    let beforeStartTime: Date | undefined
    let beforeObservationId: string | undefined

    while (true) {
      const page = yield* input.observations.listByCluster({
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: input.node.id,
        limit: TAXONOMY_CLUSTER_STREAM_PAGE_SIZE,
        ...(beforeStartTime && beforeObservationId ? { beforeStartTime, beforeObservationId } : {}),
      })
      if (page.length === 0) break

      for (const observation of page) {
        const normalized = normalizeTaxonomyEmbedding(observation.embedding)
        if (normalized.length === 0) continue
        const assignment = findBestGroup({
          embedding: normalized,
          centroids: input.groupCentroids,
          minimumSimilarity: input.childLink,
        })
        const childId = assignment === null ? undefined : input.childIdsByGroup.get(assignment.groupIndex)
        if (assignment === null || childId === undefined) continue
        batch.push({
          observation,
          assignedClusterId: childId,
          assignmentMethod: "gardening_reassign",
          assignmentConfidence: assignment.similarity,
          reassignmentRunId: input.runId,
          indexedAt: input.now,
        })
        moved++
        if (batch.length >= TAXONOMY_CLUSTER_STREAM_PAGE_SIZE) {
          const flushing = batch
          batch = []
          yield* input.observations.reassignMany(flushing)
        }
      }

      const last = page[page.length - 1]
      if (!last || page.length < TAXONOMY_CLUSTER_STREAM_PAGE_SIZE) break
      beforeStartTime = last.startTime
      beforeObservationId = last.observationId
    }
    if (batch.length > 0) yield* input.observations.reassignMany(batch)
    return moved
  })

const buildChild = (input: {
  readonly parent: TaxonomyCluster
  readonly memberEmbeddings: readonly (readonly number[])[]
  readonly memberStartTimes: readonly Date[]
  readonly now: Date
}): TaxonomyCluster => {
  let centroid = createTaxonomyCentroid()
  let clusteredAt = input.now
  for (let index = 0; index < input.memberEmbeddings.length; index++) {
    const updated = updateTaxonomyCentroid({
      centroid: { ...centroid, clusteredAt },
      embedding: input.memberEmbeddings[index] ?? [],
      weight: 1,
      timestamp: input.memberStartTimes[index] ?? input.now,
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
    organizationId: input.parent.organizationId,
    projectId: input.parent.projectId,
    dimension: input.parent.dimension,
    parentClusterId: input.parent.id,
    depth: input.parent.depth + 1,
    path: `${input.parent.path}${input.parent.id}/`,
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

/**
 * Grows the cluster tree: a node whose directly-assigned observations exceed
 * the navigability budget is re-clustered at a tighter density derived from
 * its own member-pairwise similarity distribution. Members move to the
 * children (deepest fit); uncovered members stay on the parent as subtree
 * residue for future passes. A split that finds no internal structure
 * (too few children, low coverage, or one dominant child) rolls back and the
 * node stays a leaf for now.
 */
export const recurseTreeClustersUseCase = (input: RecurseTreeClustersInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const clusters = yield* TaxonomyClusterRepository
    const observations = yield* TaxonomyObservationRepository

    const active = yield* clusters.listActiveByProject({ projectId: input.projectId, dimension })
    const candidates = active
      .filter(
        (node) =>
          node.depth < TAXONOMY_TREE_MAX_DEPTH && node.observationCount >= TAXONOMY_TREE_RECURSE_MIN_OBSERVATIONS,
      )
      .sort((a, b) => b.observationCount - a.observationCount)
      .slice(0, TAXONOMY_TREE_RECURSE_PER_RUN)

    let nodesRecursed = 0
    let childrenBorn = 0
    let observationsMoved = 0
    const lineage: TaxonomyClusterLineage[] = []

    for (const node of candidates) {
      const { sample, totalMembers } = yield* sampleParentMembers({
        observations,
        organizationId: input.organizationId,
        projectId: input.projectId,
        node,
      })
      if (totalMembers < TAXONOMY_TREE_RECURSE_MIN_OBSERVATIONS || sample.length < TAXONOMY_TREE_MIN_CHILDREN) continue

      const normalized = sample.map((member) => member.normalized)

      // Per-node density schedule. A node's child density is FIXED at its
      // first split: re-splitting regrown residue reuses the stored
      // splitLinkThreshold so every child of one parent belongs to the same
      // density cohort — merge floors and descent gates read that single
      // scalar, and re-deriving it from residue alone would silently re-tune
      // the level for siblings born under the original density.
      const childLink =
        node.splitLinkThreshold ??
        (() => {
          const pairLimit = Math.min(normalized.length, 150)
          const pairSimilarities: number[] = []
          for (let i = 0; i < pairLimit; i++) {
            for (let j = i + 1; j < pairLimit; j++) {
              const left = normalized[i]
              const right = normalized[j]
              if (left && right) pairSimilarities.push(cosineSimilarityNormalized(left, right))
            }
          }
          pairSimilarities.sort((a, b) => a - b)
          return clamp(
            quantileSorted(pairSimilarities, TAXONOMY_TREE_CHILD_LINK_QUANTILE),
            TAXONOMY_TREE_CHILD_LINK_MIN,
            TAXONOMY_TREE_CHILD_LINK_MAX,
          )
        })()
      const maxDiameter = clamp(
        (1 - childLink) * TAXONOMY_TREE_CHILD_DIAMETER_FACTOR,
        TAXONOMY_TREE_CHILD_DIAMETER_MIN,
        TAXONOMY_TREE_CHILD_DIAMETER_MAX,
      )
      const proposalMinMembers = Math.ceil(sample.length * TAXONOMY_VISIBLE_BIRTH_MIN_OBSERVATION_RATIO)
      const materializedMinMembers = Math.ceil(totalMembers * TAXONOMY_VISIBLE_BIRTH_MIN_OBSERVATION_RATIO)

      const groups = [
        ...diameterBoundedGreedyClusters({
          embeddings: normalized,
          connectivityThreshold: childLink,
          minMembers: proposalMinMembers,
          maxDiameter,
        }),
      ]
        .sort((a, b) => b.members.length - a.members.length)
        .slice(0, TAXONOMY_TREE_CHILDREN_CAP)

      // Rollback checks: the node must actually have internal structure.
      // Root splits can be broad and imbalanced (retail vs flight vs mobile),
      // while deeper splits need a stricter dominance cap so a child does not
      // become a near-duplicate bucket for most of its parent.
      const covered = groups.reduce((sum, group) => sum + group.members.length, 0)
      const dominant = groups[0]?.members.length ?? 0
      const maxChildDominance =
        node.depth === 0 ? TAXONOMY_TREE_MAX_CHILD_DOMINANCE : TAXONOMY_TREE_DEEP_MAX_CHILD_DOMINANCE
      if (
        groups.length < TAXONOMY_TREE_MIN_CHILDREN ||
        covered / sample.length < TAXONOMY_TREE_MIN_COVERAGE ||
        (covered > 0 && dominant / covered > maxChildDominance)
      ) {
        continue
      }

      const groupCentroids = groups.map((group) =>
        meanNormalizedEmbedding(
          group.members
            .map((index) => normalized[index])
            .filter((embedding): embedding is number[] => embedding !== undefined),
        ),
      )

      const support = yield* collectAssignmentSupport({
        observations,
        organizationId: input.organizationId,
        projectId: input.projectId,
        node,
        groupCentroids,
        childLink,
        now,
      })
      const supportedGroups = support.aggregates
        .map((aggregate, groupIndex) => ({ aggregate, groupIndex }))
        .filter(({ aggregate }) => aggregate.count >= materializedMinMembers)
        .sort((a, b) => b.aggregate.count - a.aggregate.count)
      const materializedCovered = supportedGroups.reduce((sum, group) => sum + group.aggregate.count, 0)
      const materializedDominant = supportedGroups[0]?.aggregate.count ?? 0
      if (
        supportedGroups.length < TAXONOMY_TREE_MIN_CHILDREN ||
        materializedCovered / totalMembers < TAXONOMY_TREE_MIN_COVERAGE ||
        (materializedCovered > 0 && materializedDominant / materializedCovered > maxChildDominance) ||
        hasNearDuplicateChildCentroids(supportedGroups.map((group) => group.aggregate))
      ) {
        continue
      }

      const childIds: TaxonomyCluster["id"][] = []
      const childIdsByGroup = new Map<number, TaxonomyCluster["id"]>()
      for (const { aggregate, groupIndex } of supportedGroups) {
        const child: TaxonomyCluster = {
          ...buildChild({ parent: node, memberEmbeddings: [], memberStartTimes: [], now }),
          centroid: aggregate.centroid,
          observationCount: aggregate.count,
          firstObservedAt: aggregate.firstObservedAt ?? now,
          lastObservedAt: aggregate.lastObservedAt ?? now,
          clusteredAt: aggregate.clusteredAt,
        }
        yield* clusters.save(child)
        childIds.push(child.id)
        childIdsByGroup.set(groupIndex, child.id)
        childrenBorn++
      }
      const movedFromNode = yield* reassignValidChildren({
        observations,
        organizationId: input.organizationId,
        projectId: input.projectId,
        runId: input.runId,
        node,
        groupCentroids,
        childIdsByGroup,
        childLink,
        now,
      })
      observationsMoved += movedFromNode

      // Parent remains the aggregate/residue bucket: confident members move to
      // children, while ambiguous members stay directly assigned to the parent.
      // Persist the split density so child-level merge floors/read gates use the
      // density that created this level.
      // The save runs under the cluster lock against a fresh read — live
      // assignment increments the same counter concurrently and must not be
      // lost to this snapshot.
      yield* withTaxonomyClusterLock(
        { organizationId: input.organizationId, clusterId: node.id, ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS },
        Effect.gen(function* () {
          const fresh = yield* clusters.findById(node.id)
          yield* clusters.save({
            ...fresh,
            splitLinkThreshold: childLink,
            updatedAt: now,
          })
        }),
      )

      lineage.push({
        id: TaxonomyLineageId(generateId()),
        organizationId: input.organizationId,
        projectId: input.projectId,
        dimension,
        runId: input.runId,
        transitionType: "split",
        fromClusterIds: [node.id],
        toClusterIds: childIds,
        similarity: null,
        createdAt: now,
      })
      nodesRecursed++
    }

    return { nodesRecursed, childrenBorn, observationsMoved, lineage } satisfies RecurseTreeClustersResult
  }).pipe(Effect.withSpan("taxonomy.recurseTreeClusters"))
