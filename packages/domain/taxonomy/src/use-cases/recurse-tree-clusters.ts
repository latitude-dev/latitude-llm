import type { TaxonomyRunId } from "@domain/shared"
import { generateId, type OrganizationId, type ProjectId, TaxonomyClusterId, TaxonomyLineageId } from "@domain/shared"
import { Effect } from "effect"
import {
  TAXONOMY_CALIBRATION_DIAMETER_FACTOR,
  TAXONOMY_CALIBRATION_DIAMETER_MAX,
  TAXONOMY_CALIBRATION_DIAMETER_MIN,
  TAXONOMY_CLUSTER_LOCK_TTL_SECONDS,
  TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
  TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
  TAXONOMY_TREE_CHILD_LINK_MAX,
  TAXONOMY_TREE_CHILD_LINK_MIN,
  TAXONOMY_TREE_CHILD_LINK_QUANTILE,
  TAXONOMY_TREE_CHILD_MIN_MEMBERS_RATIO,
  TAXONOMY_TREE_CHILDREN_CAP,
  TAXONOMY_TREE_MAX_CHILD_DOMINANCE,
  TAXONOMY_TREE_MAX_DEPTH,
  TAXONOMY_TREE_MIN_CHILDREN,
  TAXONOMY_TREE_MIN_COVERAGE,
  TAXONOMY_TREE_RECURSE_MIN_OBSERVATIONS,
  TAXONOMY_TREE_RECURSE_PER_RUN,
  TAXONOMY_TREE_RECURSE_SHARE,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import {
  clamp,
  cosineSimilarityNormalized,
  createTaxonomyCentroid,
  diameterBoundedGreedyClusters,
  normalizeTaxonomyEmbedding,
  quantileSorted,
  updateTaxonomyCentroid,
} from "../helpers.ts"
import { withTaxonomyClusterLock } from "../locks.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

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
    const totalObservations = active.reduce((sum, cluster) => sum + cluster.observationCount, 0)
    if (totalObservations === 0) {
      return {
        nodesRecursed: 0,
        childrenBorn: 0,
        observationsMoved: 0,
        lineage: [],
      } satisfies RecurseTreeClustersResult
    }

    const candidates = active
      .filter(
        (node) =>
          node.depth < TAXONOMY_TREE_MAX_DEPTH &&
          node.observationCount >= TAXONOMY_TREE_RECURSE_MIN_OBSERVATIONS &&
          node.observationCount / totalObservations >= TAXONOMY_TREE_RECURSE_SHARE,
      )
      .sort((a, b) => b.observationCount - a.observationCount)
      .slice(0, TAXONOMY_TREE_RECURSE_PER_RUN)

    let nodesRecursed = 0
    let childrenBorn = 0
    let observationsMoved = 0
    const lineage: TaxonomyClusterLineage[] = []

    for (const node of candidates) {
      const members = yield* observations.listAllByCluster({
        organizationId: input.organizationId,
        projectId: input.projectId,
        clusterId: node.id,
        limit: TAXONOMY_LIST_ALL_BY_CLUSTER_MAX,
      })
      if (members.length < TAXONOMY_TREE_RECURSE_MIN_OBSERVATIONS) continue

      const normalized = members.map((member) => normalizeTaxonomyEmbedding(member.embedding))

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
        (1 - childLink) * TAXONOMY_CALIBRATION_DIAMETER_FACTOR,
        TAXONOMY_CALIBRATION_DIAMETER_MIN,
        TAXONOMY_CALIBRATION_DIAMETER_MAX,
      )
      const minMembers = Math.max(
        TAXONOMY_NOISE_BIRTH_MIN_MEMBERS_FLOOR,
        Math.round(members.length * TAXONOMY_TREE_CHILD_MIN_MEMBERS_RATIO),
      )

      const groups = [
        ...diameterBoundedGreedyClusters({
          embeddings: normalized,
          connectivityThreshold: childLink,
          minMembers,
          maxDiameter,
        }),
      ]
        .sort((a, b) => b.members.length - a.members.length)
        .slice(0, TAXONOMY_TREE_CHILDREN_CAP)

      // Rollback checks: the node must actually have internal structure.
      const covered = groups.reduce((sum, group) => sum + group.members.length, 0)
      const dominant = groups[0]?.members.length ?? 0
      if (
        groups.length < TAXONOMY_TREE_MIN_CHILDREN ||
        covered / members.length < TAXONOMY_TREE_MIN_COVERAGE ||
        (covered > 0 && dominant / covered > TAXONOMY_TREE_MAX_CHILD_DOMINANCE)
      ) {
        continue
      }

      const childIds: TaxonomyCluster["id"][] = []
      let movedFromNode = 0
      for (const group of groups) {
        const memberObservations = group.members
          .map((index) => members[index])
          .filter((member): member is (typeof members)[number] => member !== undefined)
        const memberEmbeddings = group.members
          .map((index) => normalized[index])
          .filter((embedding): embedding is number[] => embedding !== undefined)
        const child = buildChild({
          parent: node,
          memberEmbeddings,
          memberStartTimes: memberObservations.map((member) => member.startTime),
          now,
        })
        yield* clusters.save(child)
        yield* observations.reassignMany(
          memberObservations.map((observation) => ({
            observation,
            assignedClusterId: child.id,
            assignmentMethod: "gardening_reassign",
            assignmentConfidence: 1,
            reassignmentRunId: input.runId,
            indexedAt: now,
          })),
        )
        childIds.push(child.id)
        childrenBorn++
        movedFromNode += memberObservations.length
      }
      observationsMoved += movedFromNode

      // Parent keeps only the uncovered residue. The listed members are the
      // source of truth — the stored counter can lag behind (e.g. absorbed
      // groups); anything beyond the list cap stays counted on top. The split
      // density is persisted so child-level merge floors and descent gates
      // use the density that created this level. The centroid is deliberately
      // NOT recomputed from the residue: an interior node represents its
      // whole subtree for the first hop of deepest-fit descent, so it keeps
      // the full-membership centroid. The save runs under the cluster lock
      // against a fresh read — live assignment increments the same counter
      // concurrently and must not be lost to this snapshot.
      yield* withTaxonomyClusterLock(
        { organizationId: input.organizationId, clusterId: node.id, ttlSeconds: TAXONOMY_CLUSTER_LOCK_TTL_SECONDS },
        Effect.gen(function* () {
          const fresh = yield* clusters.findById(node.id)
          yield* clusters.save({
            ...fresh,
            observationCount:
              Math.max(0, members.length - movedFromNode) + Math.max(0, fresh.observationCount - members.length),
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
