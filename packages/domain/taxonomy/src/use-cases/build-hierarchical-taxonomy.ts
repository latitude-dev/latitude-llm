/**
 * Divisive hierarchical taxonomy build — the single use case the gardening
 * workflow calls to materialize the cluster tree.
 *
 * High level:
 *   1. List an adaptive, capped sample from the lookback window, regardless
 *      of current assignment. The repository
 *      day-stratifies this sample: it ranks each observation within its own
 *      day and interleaves days round-robin, so the bounded sample is
 *      representative of the whole window rather than biased toward the last
 *      few hours. On large tenants (5M sessions/month) this spreads the budget
 *      across days; small tenants whose corpus fits under the cap see their
 *      whole live window, while larger tenants use a system-wide hard cap.
 *      The sample is slim (id, start
 *      time, embedding) so
 *      projection metadata does not round-trip through the workflow worker.
 *      The sample is deterministic (hash-ordered, no rand()) so a gardening
 *      pass replays identically under Temporal.
 *   2. Build the tree top-down with `buildHierarchicalClusters` using the
 *      per-depth schedule. The schedule encodes broad-at-the-root,
 *      narrow-at-the-leaves without per-corpus tuning.
 *   3. Persist clusters top-down so child rows always have a valid parent.
 *      Interior nodes get a `splitLinkThreshold` derived from the chosen K's
 *      tightest sibling-pair cosine so the online router has a per-level
 *      gate to descend by.
 *   4. Match the new nodes 1:1 against the previously-active clusters with a
 *      Hungarian centroid assignment (`matchTaxonomyLineage`). A confident
 *      same-depth match reuses the old cluster's id so trends that key on the
 *      id stay continuous across passes; everything else gets a fresh cuid.
 *   5. Materialize and persist the rows. `save` upserts on id, so a
 *      continuation updates its predecessor's row in place (new centroid,
 *      preserved age, carried-over name when the topic barely moved).
 *   6. Re-assign every member observation directly to its leaf cluster with a
 *      ClickHouse-side INSERT SELECT keyed by observation id (interior nodes
 *      carry derived counts only).
 *   7. Deprecate every previously-active cluster that no new node continued.
 *   8. Emit `continuation` rows for reused ids, `birth` rows for new nodes,
 *      and `death` rows for the deprecated clusters.
 *
 * What is intentionally NOT here:
 *   - LLM naming. Names are assigned by the workflow's naming step against
 *     the rows persisted here. We persist "Pending" names so the naming
 *     activity has a clear work queue.
 *   - Sibling merges and noise reassign. The top-down build cannot produce
 *     near-duplicate siblings (enforced by maxSiblingCosine in the schedule)
 *     and every member is assigned to a leaf — there is no noise pool.
 */

import { resolveEmbeddingConfig } from "@domain/ai"
import {
  type CustomBehaviorId,
  type FilterSet,
  generateId,
  type OrganizationId,
  type ProjectId,
  TaxonomyClusterId,
  TaxonomyLineageId,
  type TaxonomyRunId,
} from "@domain/shared"
import { Effect } from "effect"
import {
  type BuildHierarchicalClustersInput,
  buildHierarchicalClusters,
  type ClusteringTreeNode,
} from "../clustering.ts"
import {
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
  TAXONOMY_CONTINUATION_THRESHOLD,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_NAME_REUSE_THRESHOLD,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TAXONOMY_PENDING_DISPLAY_NAME,
  TAXONOMY_TREE_DEPTH_SCHEDULE,
} from "../constants.ts"
import type { TaxonomyCluster } from "../entities/cluster.ts"
import type { CustomBehaviorAssignment } from "../entities/custom-behavior-assignment.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import {
  cosineSimilarityNormalized,
  createTaxonomyCentroid,
  normalizeTaxonomyCentroid,
  normalizeTaxonomyEmbedding,
  updateTaxonomyCentroid,
} from "../helpers.ts"
import { type LineageDecision, matchTaxonomyLineage } from "../lineage.ts"
import { TaxonomyClusterRepository } from "../ports/taxonomy-cluster-repository.ts"
import {
  type ReassignTaxonomyObservationByIdInput,
  TaxonomyObservationRepository,
  type TaxonomyScopedClusteringObservation,
} from "../ports/taxonomy-observation-repository.ts"

export interface BuildHierarchicalTaxonomyInput {
  readonly organizationId: OrganizationId
  readonly projectId: ProjectId
  readonly runId: TaxonomyRunId
  readonly dimension?: TaxonomyDimensionType
  readonly now?: Date
}

export interface BuildHierarchicalTaxonomyResult {
  readonly observationsScanned: number
  readonly observationsAvailable: number
  readonly observationsSampled: number
  readonly sampleStrategy: string
  readonly sampleCap: number
  /** Genuinely new nodes (no confident predecessor). */
  readonly clustersBorn: number
  /** Nodes that reused a previously-active cluster's id (`continuation`). */
  readonly clustersContinued: number
  readonly clustersDeprecated: number
  readonly leavesAssigned: number
  readonly maxDepthReached: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

export type TaxonomyClusterBuilder = (
  input: BuildHierarchicalClustersInput,
) => Effect.Effect<ClusteringTreeNode, Error, never>

export interface PlanHierarchicalTaxonomyInput extends BuildHierarchicalTaxonomyInput {
  readonly clusterBuilder?: TaxonomyClusterBuilder
  /**
   * Scope. Absent ⇒ global gardening (project-wide sample, membership written to
   * `taxonomy_observations.assigned_cluster_id`). Present ⇒ a custom behavior's
   * scoped sub-tree (FilterSet session slice, membership written to the
   * `custom_behavior_assignments` slice). Global callers omit both so their
   * serialized payloads are byte-identical to the pre-unification workflow.
   */
  readonly customBehaviorId?: CustomBehaviorId
  readonly filterSet?: FilterSet
}

export interface HierarchicalTaxonomyPlan extends BuildHierarchicalTaxonomyResult {
  /** Depth-ascending; write boundaries must preserve order so children are not saved before parents. */
  readonly clusters: readonly TaxonomyCluster[]
  /** Global write target: reassign `assigned_cluster_id`. Empty on the scoped path. */
  readonly observationAssignments: readonly ReassignTaxonomyObservationByIdInput[]
  /** Scoped write target: the `custom_behavior_assignments` slice. Empty on the global path. */
  readonly customAssignments: readonly CustomBehaviorAssignment[]
  /** Non-null ⇒ the plan is scoped to this custom behavior (drives the write target). */
  readonly customBehaviorId: CustomBehaviorId | null
  readonly deprecatedClusterIds: readonly TaxonomyClusterId[]
}

const lookbackStart = (now: Date): Date =>
  new Date(now.getTime() - TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS * 24 * 60 * 60_000)

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
  /** NULL = global taxonomy; non-null scopes the row to a custom behavior's sub-tree. */
  readonly customBehaviorId?: CustomBehaviorId | null
  readonly dimension: TaxonomyDimensionType
  readonly parentId: string | null
  readonly path: string
  readonly depth: number
  readonly splitLinkThreshold: number | null
  readonly memberEmbeddings: readonly (readonly number[])[]
  readonly memberStartTimes: readonly Date[]
  readonly memberCount: number
  readonly now: Date
  /** Carried over on a name-stable continuation; "Pending" otherwise. */
  readonly name: string
  readonly description: string
  /**
   * On a continuation we preserve the predecessor's birth/creation timestamps
   * so the cluster's age survives the rebuild; fresh births fall back to the
   * current pass.
   */
  readonly firstObservedAt?: Date | undefined
  readonly createdAt?: Date | undefined
  /** Model of the embedding space the member embeddings live in. */
  readonly embeddingModel: string
}): TaxonomyCluster => {
  let centroid = createTaxonomyCentroid(input.embeddingModel)
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
    customBehaviorId: input.customBehaviorId ?? null,
    dimension: input.dimension,
    parentClusterId: input.parentId === null ? null : TaxonomyClusterId(input.parentId),
    depth: input.depth,
    path: input.path,
    splitLinkThreshold: input.splitLinkThreshold,
    name: input.name,
    description: input.description,
    centroid,
    observationCount: input.memberCount,
    state: "active",
    mergedIntoClusterId: null,
    firstObservedAt: input.firstObservedAt ?? sortedTimes[0] ?? input.now,
    lastObservedAt: sortedTimes[sortedTimes.length - 1] ?? input.now,
    clusteredAt,
    createdAt: input.createdAt ?? input.now,
    updatedAt: input.now,
  }
}

/**
 * The minimum sibling cosine inside `children` becomes the parent's
 * `splitLinkThreshold` — it expresses the density boundary at which children
 * are still distinguishable from each other, which is what the online router
 * uses as a per-level descent gate.
 */
export const computeSplitLinkThreshold = (children: readonly ClusteringTreeNode[]): number | null => {
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
  // Cosine similarity is [-1, 1], but the stored threshold contract is [0, 1];
  // near-orthogonal centroids can dip just below 0, so clamp to keep it valid.
  return Number.isFinite(minPair) ? Math.min(1, Math.max(0, minPair)) : null
}

interface PersistedLeaf {
  readonly clusterId: TaxonomyClusterId
  readonly observationIndices: readonly number[]
  /** Pre-computed centroid for the leaf so reassignment can score confidence. */
  readonly centroid: readonly number[]
}

/**
 * A node of the freshly built tree, captured before any id is assigned. The
 * continuity matcher needs every node's centroid up front (it solves one global
 * 1:1 assignment), so we collect descriptors first, match, resolve ids, and
 * only then materialize the persisted rows.
 */
interface NodeDescriptor {
  readonly tempId: string
  readonly parentTempId: string | null
  readonly depth: number
  /** Normalized centroid of the node's members. */
  readonly centroid: readonly number[]
  readonly splitLinkThreshold: number | null
  readonly memberIndices: readonly number[]
  readonly isLeaf: boolean
}

const collectNodes = (
  node: ClusteringTreeNode,
  parentTempId: string | null,
  counter: { value: number },
  out: NodeDescriptor[],
): string => {
  const tempId = String(counter.value++)
  out.push({
    tempId,
    parentTempId,
    depth: node.depth,
    centroid: node.centroid,
    splitLinkThreshold: computeSplitLinkThreshold(node.children),
    memberIndices: node.memberIndices,
    isLeaf: node.children.length === 0,
  })
  for (const child of node.children) collectNodes(child, tempId, counter, out)
  return tempId
}

/**
 * Match the freshly built nodes 1:1 against the previously-active clusters and
 * resolve every node's final id: a confident continuation reuses its
 * predecessor's id (keeping id-keyed trends continuous), everything else gets a
 * fresh cuid. Shared by the global and custom-behavior builds — the scope of
 * `previouslyActive` is the only thing that differs, and the caller chooses it.
 */
interface ResolvedTaxonomyLineage {
  readonly oldById: ReadonlyMap<string, TaxonomyCluster>
  readonly decisionByTempId: ReadonlyMap<string, LineageDecision>
  readonly finalIdByTempId: ReadonlyMap<string, string>
}

const resolveTaxonomyLineage = (input: {
  readonly descriptors: readonly NodeDescriptor[]
  readonly previouslyActive: readonly TaxonomyCluster[]
}): ResolvedTaxonomyLineage => {
  const oldById = new Map(input.previouslyActive.map((cluster) => [cluster.id as string, cluster] as const))
  const match = matchTaxonomyLineage({
    newNodes: input.descriptors.map((node) => ({ tempId: node.tempId, depth: node.depth, centroid: node.centroid })),
    oldClusters: input.previouslyActive.map((cluster) => ({
      id: cluster.id,
      depth: cluster.depth,
      centroid: normalizeTaxonomyCentroid(cluster.centroid),
    })),
    continuationThreshold: TAXONOMY_CONTINUATION_THRESHOLD,
    nameReuseThreshold: TAXONOMY_NAME_REUSE_THRESHOLD,
  })
  const decisionByTempId = new Map(match.decisions.map((decision) => [decision.tempId, decision] as const))
  const finalIdByTempId = new Map<string, string>()
  for (const node of input.descriptors) {
    const decision = decisionByTempId.get(node.tempId)
    finalIdByTempId.set(node.tempId, decision?.transition === "continuation" ? decision.reuseId : generateId())
  }
  return { oldById, decisionByTempId, finalIdByTempId }
}

export const planHierarchicalTaxonomyUseCase = (input: PlanHierarchicalTaxonomyInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const embeddingConfig = yield* resolveEmbeddingConfig()
    const observationsRepo = yield* TaxonomyObservationRepository
    const clustersRepo = yield* TaxonomyClusterRepository
    const scopedBehaviorId = input.customBehaviorId ?? null
    // A scoped run without a filter would sample the whole project yet tag the
    // clusters/assignments to the behavior — silently wrong. Custom behaviors
    // always carry a non-empty filter, so fail fast rather than fall back to `{}`.
    if (scopedBehaviorId !== null && (!input.filterSet || Object.keys(input.filterSet).length === 0)) {
      return yield* Effect.die(
        new Error(`planHierarchicalTaxonomy: scoped run for ${scopedBehaviorId} requires a non-empty filterSet`),
      )
    }
    const since = lookbackStart(now)
    // Scoped gardening samples the behavior's FilterSet session slice (rows carry
    // sessionId for the assignment write); global samples the project-wide window.
    const observations = scopedBehaviorId
      ? yield* observationsRepo.listForCustomBehaviorSample({
          organizationId: input.organizationId,
          projectId: input.projectId,
          since,
          limit: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
          filterSet: input.filterSet ?? {},
        })
      : yield* observationsRepo.listForClusteringSample({
          organizationId: input.organizationId,
          projectId: input.projectId,
          since,
          limit: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
        })
    const observationsAvailable = scopedBehaviorId
      ? observations.length
      : (yield* observationsRepo.getCounts({ organizationId: input.organizationId, projectId: input.projectId, since }))
          .total

    const baseResult = {
      observationsScanned: observations.length,
      observationsAvailable,
      observationsSampled: observations.length,
      sampleStrategy: TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
      sampleCap: TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
    }

    if (observations.length < TAXONOMY_GARDENING_MIN_OBSERVATIONS) {
      return {
        ...baseResult,
        clustersBorn: 0,
        clustersContinued: 0,
        clustersDeprecated: 0,
        leavesAssigned: 0,
        maxDepthReached: 0,
        lineage: [],
        clusters: [],
        observationAssignments: [],
        customAssignments: [],
        customBehaviorId: scopedBehaviorId,
        deprecatedClusterIds: [],
      } satisfies HierarchicalTaxonomyPlan
    }

    const normalizedEmbeddings = observations.map((observation) => normalizeTaxonomyEmbedding(observation.embedding))
    const clusterBuilder =
      input.clusterBuilder ??
      ((builderInput: BuildHierarchicalClustersInput) => Effect.sync(() => buildHierarchicalClusters(builderInput)))
    const tree = yield* clusterBuilder({
      embeddings: normalizedEmbeddings,
      depthSchedule: TAXONOMY_TREE_DEPTH_SCHEDULE,
      restarts: TAXONOMY_KMEANS_RESTARTS,
      maxIter: TAXONOMY_KMEANS_MAX_ITER,
      tolerance: TAXONOMY_KMEANS_TOLERANCE,
      seed: seedFromProjectId(scopedBehaviorId ? `${input.projectId}:${scopedBehaviorId}` : input.projectId),
    })

    const descriptors: NodeDescriptor[] = []
    collectNodes(tree, null, { value: 0 }, descriptors)

    const previouslyActive = yield* clustersRepo.listActiveByProject({
      projectId: input.projectId,
      dimension,
      ...(input.customBehaviorId ? { customBehaviorId: input.customBehaviorId } : {}),
    })
    const { oldById, decisionByTempId, finalIdByTempId } = resolveTaxonomyLineage({ descriptors, previouslyActive })

    const orderedDescriptors = [...descriptors].sort((a, b) => a.depth - b.depth)
    const pathByTempId = new Map<string, string>()
    const bornClusters: TaxonomyCluster[] = []
    const bornLeaves: PersistedLeaf[] = []
    const lineage: TaxonomyClusterLineage[] = []
    let maxDepth = 0
    let clustersBorn = 0
    let clustersContinued = 0
    for (const node of orderedDescriptors) {
      const finalId = finalIdByTempId.get(node.tempId) ?? generateId()
      const parentFinalId = node.parentTempId === null ? null : (finalIdByTempId.get(node.parentTempId) ?? null)
      const parentPath = node.parentTempId === null ? "" : (pathByTempId.get(node.parentTempId) ?? "")
      const path = parentFinalId === null ? "" : `${parentPath}${parentFinalId}/`
      pathByTempId.set(node.tempId, path)

      const decision = decisionByTempId.get(node.tempId)
      const old = decision?.transition === "continuation" ? oldById.get(decision.reuseId) : undefined
      const carryName = decision?.transition === "continuation" && decision.carryName && old !== undefined

      const memberEmbeddings = node.memberIndices.map((index) => normalizedEmbeddings[index] ?? [])
      const memberStartTimes = node.memberIndices.map((index) => observations[index]?.startTime ?? now)
      const directCount = node.isLeaf ? node.memberIndices.length : 0
      const cluster = buildPersistedCluster({
        id: finalId,
        organizationId: input.organizationId,
        projectId: input.projectId,
        customBehaviorId: input.customBehaviorId ?? null,
        dimension,
        parentId: parentFinalId,
        path,
        depth: node.depth,
        splitLinkThreshold: node.splitLinkThreshold,
        memberEmbeddings,
        memberStartTimes,
        memberCount: directCount,
        now,
        name: carryName && old ? old.name : TAXONOMY_PENDING_DISPLAY_NAME,
        description: carryName && old ? old.description : "",
        firstObservedAt: old?.firstObservedAt,
        createdAt: old?.createdAt,
        embeddingModel: embeddingConfig.model,
      })
      bornClusters.push(cluster)
      if (node.depth > maxDepth) maxDepth = node.depth

      if (old) {
        clustersContinued++
        lineage.push({
          id: TaxonomyLineageId(generateId()),
          organizationId: input.organizationId,
          projectId: input.projectId,
          dimension,
          runId: input.runId,
          transitionType: "continuation",
          fromClusterIds: [old.id],
          toClusterIds: [cluster.id],
          similarity: decision?.transition === "continuation" ? decision.similarity : null,
          createdAt: now,
        })
      } else {
        clustersBorn++
        lineage.push({
          id: TaxonomyLineageId(generateId()),
          organizationId: input.organizationId,
          projectId: input.projectId,
          dimension,
          runId: input.runId,
          transitionType: "birth",
          fromClusterIds: [],
          toClusterIds: [cluster.id],
          similarity: null,
          createdAt: now,
        })
      }

      if (node.isLeaf) {
        bornLeaves.push({ clusterId: cluster.id, observationIndices: node.memberIndices, centroid: node.centroid })
      }
    }

    const leafMembers = bornLeaves.flatMap((leaf) =>
      leaf.observationIndices.flatMap((index) => {
        const observation = observations[index]
        const embedding = normalizedEmbeddings[index]
        if (!observation || !embedding) return []
        const confidence = Math.max(0, Math.min(1, cosineSimilarityNormalized(embedding, leaf.centroid)))
        return [{ leaf, observation, confidence }]
      }),
    )

    // Two write targets, picked by scope: global reassigns the observation's
    // `assigned_cluster_id`; a scoped run writes the `custom_behavior_assignments`
    // slice (carrying sessionId + customBehaviorId), never the global column.
    const observationAssignments: ReassignTaxonomyObservationByIdInput[] = scopedBehaviorId
      ? []
      : leafMembers.map(({ leaf, observation, confidence }) => ({
          observationId: observation.observationId,
          assignedClusterId: leaf.clusterId,
          assignmentMethod: "gardening_birth" as const,
          assignmentConfidence: confidence,
          reassignmentRunId: input.runId,
          indexedAt: now,
        }))
    const customAssignments: CustomBehaviorAssignment[] = scopedBehaviorId
      ? leafMembers.flatMap(({ leaf, observation, confidence }) => {
          // Scoped samples come from listForCustomBehaviorSample and carry a
          // sessionId; guard at runtime (via a widening cast, not an unchecked
          // one) so a non-scoped observation can never yield a `sessionId:
          // undefined` assignment.
          const sessionId = (observation as Partial<TaxonomyScopedClusteringObservation>).sessionId
          if (sessionId === undefined) return []
          return [
            {
              organizationId: input.organizationId,
              projectId: input.projectId,
              customBehaviorId: scopedBehaviorId,
              observationId: observation.observationId,
              sessionId,
              assignedClusterId: leaf.clusterId,
              assignmentConfidence: confidence,
              assignmentMethod: "gardening_birth" as const,
              reassignmentRunId: input.runId,
              startTime: observation.startTime,
              retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
              indexedAt: now,
            } satisfies CustomBehaviorAssignment,
          ]
        })
      : []

    const finalIds = new Set(finalIdByTempId.values())
    const deprecatedClusterIds: TaxonomyClusterId[] = []
    for (const cluster of previouslyActive) {
      if (finalIds.has(cluster.id)) continue
      deprecatedClusterIds.push(cluster.id)
      lineage.push({
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
      ...baseResult,
      clustersBorn,
      clustersContinued,
      clustersDeprecated: deprecatedClusterIds.length,
      leavesAssigned: bornLeaves.reduce((sum, leaf) => sum + leaf.observationIndices.length, 0),
      maxDepthReached: maxDepth,
      lineage,
      clusters: bornClusters,
      observationAssignments,
      customAssignments,
      customBehaviorId: scopedBehaviorId,
      deprecatedClusterIds,
    } satisfies HierarchicalTaxonomyPlan
  }).pipe(Effect.withSpan("taxonomy.planHierarchicalTaxonomy"))
