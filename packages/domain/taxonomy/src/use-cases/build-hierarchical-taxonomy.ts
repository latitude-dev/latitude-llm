/**
 * Divisive hierarchical taxonomy build — the single use case the gardening
 * workflow calls to materialize the cluster tree.
 *
 * High level:
 *   1. List the newest TAXONOMY_GARDENING_OBSERVATION_WINDOW_MAX observations
 *      in the live window, regardless of current assignment. This is the
 *      bounded sample the rest of the algorithm operates on; on large
 *      tenants (5M sessions/month) it is a per-day-stratified slice — small
 *      tenants see their whole live window.
 *   2. Build the tree top-down with `buildHierarchicalClusters` using the
 *      per-depth schedule. The schedule encodes broad-at-the-root,
 *      narrow-at-the-leaves without per-corpus tuning.
 *   3. Persist clusters top-down so child rows always have a valid parent.
 *      Interior nodes get a `splitLinkThreshold` derived from the chosen K's
 *      tightest sibling-pair cosine so the online router has a per-level
 *      gate to descend by.
 *   4. Re-assign every member observation directly to its leaf cluster
 *      (interior nodes carry derived counts only). This is the "birth"
 *      transition for everything in this pass.
 *   5. Deprecate every previously-active cluster that we did not just
 *      re-emit — there is no continuity matcher in this pass; each
 *      gardening cycle is a clean rebuild. (Stable id lineage across runs
 *      is captured by `taxonomy_cluster_lineage` rows; clients displaying
 *      historical trends already query CH which is the ground truth.)
 *   6. Emit `birth` rows for each new cluster and `death` rows for the
 *      previously-active clusters that got deprecated.
 *
 * What is intentionally NOT here:
 *   - LLM naming. Names are assigned by the workflow's naming step against
 *     the rows persisted here. We persist "Pending" names so the naming
 *     activity has a clear work queue.
 *   - Sibling merges and noise reassign. The top-down build cannot produce
 *     near-duplicate siblings (enforced by maxSiblingCosine in the schedule)
 *     and every member is assigned to a leaf — there is no noise pool.
 */

import {
  generateId,
  type OrganizationId,
  type ProjectId,
  TaxonomyClusterId,
  TaxonomyLineageId,
  type TaxonomyRunId,
} from "@domain/shared"
import { Effect } from "effect"
import { buildHierarchicalClusters, type ClusteringTreeNode } from "../clustering.ts"
import {
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_NOISE_LOOKBACK_DAYS,
  TAXONOMY_PENDING_DISPLAY_NAME,
  TAXONOMY_TREE_DEPTH_SCHEDULE,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import type { TaxonomyMomentObservation } from "../entities/observation.ts"
import {
  cosineSimilarityNormalized,
  createTaxonomyCentroid,
  normalizeTaxonomyEmbedding,
  updateTaxonomyCentroid,
} from "../helpers.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import { TaxonomyObservationRepository } from "../ports/taxonomy-observation-repository.ts"

export interface BuildHierarchicalTaxonomyInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface BuildHierarchicalTaxonomyResult {
  readonly observationsScanned: number
  readonly clustersBorn: number
  readonly clustersDeprecated: number
  readonly leavesAssigned: number
  readonly maxDepthReached: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

const lookbackStart = (now: Date): Date => new Date(now.getTime() - TAXONOMY_NOISE_LOOKBACK_DAYS * 24 * 60 * 60_000)

const seedFromProjectId = (projectId: string): number => {
  let hash = 0
  for (let index = 0; index < projectId.length; index++) {
    hash = (Math.imul(hash, 31) + projectId.charCodeAt(index)) >>> 0
  }
  // Avoid a zero seed which would degenerate mulberry32.
  return hash === 0 ? 0x9e3779b9 : hash
}

const buildPersistedCluster = (input: {
  readonly id: string
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly dimension: TaxonomyDimensionType
  readonly parentId: string | null
  readonly path: string
  readonly depth: number
  readonly splitLinkThreshold: number | null
  readonly memberEmbeddings: readonly (readonly number[])[]
  readonly memberStartTimes: readonly Date[]
  readonly memberCount: number
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
    id: TaxonomyClusterId(input.id),
    organizationId: input.organizationId,
    projectId: input.projectId,
    dimension: input.dimension,
    parentClusterId: input.parentId === null ? null : TaxonomyClusterId(input.parentId),
    depth: input.depth,
    path: input.path,
    splitLinkThreshold: input.splitLinkThreshold,
    name: TAXONOMY_PENDING_DISPLAY_NAME,
    description: "",
    centroid,
    observationCount: input.memberCount,
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
 * The minimum sibling cosine inside `children` becomes the parent's
 * `splitLinkThreshold` — it expresses the density boundary at which children
 * are still distinguishable from each other, which is what the online router
 * uses as a per-level descent gate.
 */
const computeSplitLinkThreshold = (children: readonly ClusteringTreeNode[]): number | null => {
  if (children.length < 2) return null
  let minPair = Number.POSITIVE_INFINITY
  for (let i = 0; i < children.length; i++) {
    const left = children[i]?.centroid
    if (!left || left.length === 0) continue
    for (let j = i + 1; j < children.length; j++) {
      const right = children[j]?.centroid
      if (!right || right.length === 0) continue
      const similarity = cosineSimilarityNormalized(left, right)
      if (similarity < minPair) minPair = similarity
    }
  }
  return Number.isFinite(minPair) ? minPair : null
}

interface PersistedLeaf {
  readonly clusterId: TaxonomyClusterId
  readonly observationIndices: readonly number[]
  /** Pre-computed centroid for the leaf so reassignment can score confidence. */
  readonly centroid: readonly number[]
}

interface WalkContext {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly dimension: TaxonomyDimensionType
  readonly observations: readonly TaxonomyMomentObservation[]
  readonly normalizedEmbeddings: readonly (readonly number[])[]
  readonly now: Date
  readonly bornClusters: TaxonomyCluster[]
  readonly bornLeaves: PersistedLeaf[]
  readonly lineage: TaxonomyClusterLineage[]
  readonly runId: TaxonomyRunId
  maxDepth: number
}

const walkAndPersist = (node: ClusteringTreeNode, parentId: string | null, parentPath: string, ctx: WalkContext) => {
  const memberEmbeddings = node.memberIndices.map((index) => ctx.normalizedEmbeddings[index] ?? [])
  const memberStartTimes = node.memberIndices.map((index) => ctx.observations[index]?.startTime ?? ctx.now)
  const id = generateId()
  const path = parentId === null ? "" : `${parentPath}${parentId}/`
  const splitLinkThreshold = computeSplitLinkThreshold(node.children)
  // PG `observation_count` caches CH's direct-assignment count. Every member
  // observation is routed to a leaf cluster, so interior nodes carry zero
  // direct count — clients roll up subtree counts at read time.
  const directCount = node.children.length === 0 ? node.memberIndices.length : 0
  const cluster = buildPersistedCluster({
    id,
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    dimension: ctx.dimension,
    parentId,
    path,
    depth: node.depth,
    splitLinkThreshold,
    memberEmbeddings,
    memberStartTimes,
    memberCount: directCount,
    now: ctx.now,
  })
  ctx.bornClusters.push(cluster)
  ctx.lineage.push({
    id: TaxonomyLineageId(generateId()),
    organizationId: ctx.organizationId,
    projectId: ctx.projectId,
    dimension: ctx.dimension,
    runId: ctx.runId,
    transitionType: "birth",
    fromClusterIds: [],
    toClusterIds: [cluster.id],
    similarity: null,
    createdAt: ctx.now,
  })
  if (node.depth > ctx.maxDepth) ctx.maxDepth = node.depth
  if (node.children.length === 0) {
    ctx.bornLeaves.push({
      clusterId: cluster.id,
      observationIndices: node.memberIndices,
      centroid: node.centroid,
    })
    return
  }
  for (const child of node.children) {
    walkAndPersist(child, id, path, ctx)
  }
}

export const buildHierarchicalTaxonomyUseCase = (input: BuildHierarchicalTaxonomyInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const observationsRepo = yield* TaxonomyObservationRepository
    const clustersRepo = yield* TaxonomyClusterRepository

    const observations = yield* observationsRepo.listForClustering({
      organizationId: input.organizationId,
      projectId: input.projectId,
      since: lookbackStart(now),
      limit: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
    })

    if (observations.length < TAXONOMY_GARDENING_MIN_OBSERVATIONS) {
      return {
        observationsScanned: observations.length,
        clustersBorn: 0,
        clustersDeprecated: 0,
        leavesAssigned: 0,
        maxDepthReached: 0,
        lineage: [],
      } satisfies BuildHierarchicalTaxonomyResult
    }

    const normalizedEmbeddings = observations.map((observation) => normalizeTaxonomyEmbedding(observation.embedding))
    const tree = buildHierarchicalClusters({
      embeddings: normalizedEmbeddings,
      depthSchedule: TAXONOMY_TREE_DEPTH_SCHEDULE,
      restarts: TAXONOMY_KMEANS_RESTARTS,
      maxIter: TAXONOMY_KMEANS_MAX_ITER,
      tolerance: TAXONOMY_KMEANS_TOLERANCE,
      seed: seedFromProjectId(input.projectId),
    })

    const ctx: WalkContext = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      dimension,
      observations,
      normalizedEmbeddings,
      now,
      bornClusters: [],
      bornLeaves: [],
      lineage: [],
      runId: input.runId,
      maxDepth: 0,
    }
    // If the entire corpus collapses to a single leaf at depth 0, the tree
    // is still useful (and exactly what tiny tenants should see) — emit it
    // as one root cluster covering everything.
    walkAndPersist(tree, null, "", ctx)

    // Persist new clusters top-down so a child save never references a
    // parent that does not exist yet.
    const orderedClusters = [...ctx.bornClusters].sort((a, b) => a.depth - b.depth)
    for (const cluster of orderedClusters) {
      yield* clustersRepo.save(cluster)
    }

    // Reassign every member observation directly to its leaf cluster.
    if (ctx.bornLeaves.length > 0) {
      const reassignments = ctx.bornLeaves.flatMap((leaf) =>
        leaf.observationIndices.flatMap((index) => {
          const observation = observations[index]
          const embedding = normalizedEmbeddings[index]
          if (!observation || !embedding) return []
          const confidence = Math.max(0, Math.min(1, cosineSimilarityNormalized(embedding, leaf.centroid)))
          return [
            {
              observation,
              assignedClusterId: leaf.clusterId,
              assignmentMethod: "gardening_birth" as const,
              assignmentConfidence: confidence,
              reassignmentRunId: input.runId,
              indexedAt: now,
            },
          ]
        }),
      )
      yield* observationsRepo.reassignMany(reassignments)
    }

    // Mark every previously-active cluster as deprecated. We do not attempt
    // continuity matching across runs in this version — each gardening pass
    // is a clean rebuild and lineage rows record the births.
    const previouslyActive = yield* clustersRepo.listActiveByProject({ projectId: input.projectId, dimension })
    const bornIds = new Set(ctx.bornClusters.map((cluster) => cluster.id))
    let clustersDeprecated = 0
    for (const cluster of previouslyActive) {
      if (bornIds.has(cluster.id)) continue
      yield* clustersRepo.markDeprecated({ clusterId: cluster.id, timestamp: now })
      clustersDeprecated++
      ctx.lineage.push({
        id: TaxonomyLineageId(generateId()),
        organizationId: input.organizationId,
        projectId: input.projectId,
        dimension,
        runId: input.runId,
        transitionType: "death",
        fromClusterIds: [cluster.id],
        toClusterIds: [],
        similarity: null,
        createdAt: now,
      })
    }

    return {
      observationsScanned: observations.length,
      clustersBorn: ctx.bornClusters.length,
      clustersDeprecated,
      leavesAssigned: ctx.bornLeaves.reduce((sum, leaf) => sum + leaf.observationIndices.length, 0),
      maxDepthReached: ctx.maxDepth,
      lineage: ctx.lineage,
    } satisfies BuildHierarchicalTaxonomyResult
  }).pipe(Effect.withSpan("taxonomy.buildHierarchicalTaxonomy"))
