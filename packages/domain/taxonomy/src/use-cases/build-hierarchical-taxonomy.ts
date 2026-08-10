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
 *   2. Build the tree top-down with exactly one builder — the node-relative
 *      adaptive one when the organization is gated on, `buildStaticHierarchicalClusters`
 *      on its per-depth schedule otherwise. The static schedule encodes
 *      broad-at-the-root, narrow-at-the-leaves without per-corpus tuning.
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
  type FacetId,
  type FilterSet,
  generateId,
  type OrganizationId,
  type ProjectId,
  TaxonomyClusterId,
  TaxonomyLineageId,
  type TaxonomyRunId,
} from "@domain/shared"
import { Duration, Effect } from "effect"
import { adaptiveFallbackReason, type TaxonomyAdaptiveFallbackReason } from "../adaptive-fallback.ts"
import {
  isAdaptiveModeActive,
  TAXONOMY_ADAPTIVE_CLUSTERING_MODE_DEFAULT,
  type TaxonomyAdaptiveClusteringMode,
} from "../adaptive-mode.ts"
import {
  buildRelativeHierarchicalClusters,
  buildStaticHierarchicalClusters,
  type ClusteringTreeNode,
  type RelativeClusteringDiagnostics,
} from "../clustering.ts"
import {
  TAXONOMY_ADAPTIVE_ESCALATION_MARGIN,
  TAXONOMY_ADAPTIVE_ESCALATION_MARGIN_FLOOR,
  TAXONOMY_ADAPTIVE_ESCALATION_MAX_WORK,
  TAXONOMY_ADAPTIVE_ESCALATION_SEARCH_WIDTH,
  TAXONOMY_ADAPTIVE_STRUCTURAL_MAX_NODES,
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_CLUSTERING_SAMPLE_STRATEGY,
  TAXONOMY_CONTINUATION_THRESHOLD,
  TAXONOMY_GARDENING_MIN_OBSERVATIONS,
  TAXONOMY_GARDENING_SAMPLE_LOOKBACK_DAYS,
  TAXONOMY_KMEANS_ESCALATION_RESTARTS,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_NAME_REUSE_THRESHOLD,
  TAXONOMY_OBSERVATION_RETENTION_DAYS,
  TAXONOMY_PENDING_DISPLAY_NAME,
  TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
  TAXONOMY_TREE_STATIC_DEPTH_SCHEDULE,
} from "../constants.ts"
import type { TaxonomyCluster, TaxonomyClusterState } from "../entities/cluster.ts"
import { TaxonomyDimension, type TaxonomyDimension as TaxonomyDimensionType } from "../entities/dimension.ts"
import type { TaxonomyClusterLineage } from "../entities/lineage.ts"
import type { TaxonomyViewAssignment } from "../entities/taxonomy-view-assignment.ts"
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
  type TaxonomyClusteringObservation,
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
  /** Children of the single depth-0 root — the rows the Behaviours read hoists as its top-level list. */
  readonly topLevelClustersBuilt: number
  readonly lineage: readonly TaxonomyClusterLineage[]
}

/**
 * Mode-tagged build request. The builder (worker or in-process) branches on
 * `mode` internally: `off` runs the static absolute-sibling-cosine builder,
 * `enforced` runs the node-relative adaptive builder. Schedules and k-means
 * constants are resolved builder-side so the request stays slim.
 */
export interface TaxonomyClusterBuildRequest {
  readonly mode: TaxonomyAdaptiveClusteringMode
  readonly embeddings: readonly (readonly number[])[]
  readonly seed: number
}

export interface TaxonomyClusterBuildResult {
  readonly root: ClusteringTreeNode
  /** Bounded, embedding-free diagnostics — null on the static (off) path. */
  readonly diagnostics: RelativeClusteringDiagnostics | null
}

export type TaxonomyClusterBuilder = (
  input: TaxonomyClusterBuildRequest,
) => Effect.Effect<TaxonomyClusterBuildResult, Error, never>

/** In-process builder (no worker) — the default used by tests and the sync path. */
export const runTaxonomyClusterBuild = (input: TaxonomyClusterBuildRequest): TaxonomyClusterBuildResult => {
  if (isAdaptiveModeActive(input.mode)) {
    const { root, diagnostics } = buildRelativeHierarchicalClusters({
      embeddings: input.embeddings,
      depthSchedule: TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
      restarts: TAXONOMY_KMEANS_RESTARTS,
      maxIter: TAXONOMY_KMEANS_MAX_ITER,
      tolerance: TAXONOMY_KMEANS_TOLERANCE,
      seed: input.seed,
      globalAbsoluteThreshold: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
      escalation: {
        restarts: TAXONOMY_KMEANS_ESCALATION_RESTARTS,
        marginThreshold: TAXONOMY_ADAPTIVE_ESCALATION_MARGIN,
        marginFloor: TAXONOMY_ADAPTIVE_ESCALATION_MARGIN_FLOOR,
        searchWidth: TAXONOMY_ADAPTIVE_ESCALATION_SEARCH_WIDTH,
        maxSearchWork: TAXONOMY_ADAPTIVE_ESCALATION_MAX_WORK,
      },
    })
    return { root, diagnostics }
  }
  const root = buildStaticHierarchicalClusters({
    embeddings: input.embeddings,
    depthSchedule: TAXONOMY_TREE_STATIC_DEPTH_SCHEDULE,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed: input.seed,
  })
  return { root, diagnostics: null }
}

export interface PlanHierarchicalTaxonomyInput extends BuildHierarchicalTaxonomyInput {
  readonly clusterBuilder?: TaxonomyClusterBuilder
  /**
   * A view is (scope × facet); scope and facet are resolved orthogonally.
   *
   * SCOPE — `customBehaviorId` absent ⇒ whole-project; present ⇒ a cohort's
   * FilterSet session slice (requires a non-empty `filterSet` on the topic path).
   *
   * FACET — `facetId` absent ⇒ the topic path (cluster the sampled observation
   * embeddings); present ⇒ a facet-scoped path, where the caller has already
   * sampled + extracted the facet projections and passes them as
   * `facetObservations` (this use-case does not sample or extract on the facet path).
   *
   * WRITE TARGET — only (whole-project, topic) writes inline to
   * `taxonomy_observations.assigned_cluster_id`; every other combination writes
   * the `taxonomy_view_assignments` slice keyed by `(customBehaviorId, facetId)`.
   * The (whole-project, topic) caller omits all three fields so its serialized
   * payload stays byte-identical to the pre-facets workflow.
   */
  readonly customBehaviorId?: CustomBehaviorId
  readonly facetId?: FacetId
  readonly filterSet?: FilterSet
  /**
   * Facet-scoped embeddings to cluster: the non-unclear facet projections the
   * caller extracted for the sampled sessions (each carries the session's
   * `observationId`/`sessionId`/`startTime`). Required on the facet path, ignored
   * on the topic path.
   */
  readonly facetObservations?: readonly TaxonomyScopedClusteringObservation[]
  /**
   * Which builder to persist, resolved in the planning activity. `off` (default)
   * is a byte-identical no-op: static builder, sample-only reassignment, active
   * clusters, centroid-similarity naming. `enforced` builds the adaptive tree as
   * `staging` clusters for the full-window reassignment + atomic swap.
   */
  readonly mode?: TaxonomyAdaptiveClusteringMode
}

/** A staging leaf the full-window reassignment routes observations into. */
export interface StagingLeafCluster {
  readonly clusterId: TaxonomyClusterId
  readonly centroid: readonly number[]
}

/** A leaf's sample member ids, the naming sample for a not-yet-assigned staging leaf. */
export interface TaxonomyClusterNamingMembers {
  readonly clusterId: TaxonomyClusterId
  readonly observationIds: readonly string[]
}

/**
 * What a reused (continuation) row looked like before the plan overwrote it, so a
 * publish that fails before the swap can put the live tree back. Only the fields
 * reads resolve a node through: centroid and counters are left as the run found
 * them, because online routing mutates those concurrently.
 */
export interface TaxonomyContinuedRestore {
  readonly clusterId: TaxonomyClusterId
  readonly parentClusterId: TaxonomyClusterId | null
  readonly path: string
  readonly depth: number
  readonly name: string
  readonly description: string
}

export interface HierarchicalTaxonomyPlan extends BuildHierarchicalTaxonomyResult {
  readonly mode: TaxonomyAdaptiveClusteringMode
  /** Depth-ascending; write boundaries must preserve order so children are not saved before parents. */
  readonly clusters: readonly TaxonomyCluster[]
  /**
   * Global write target: reassign `assigned_cluster_id`. Empty on the scoped
   * path AND on the adaptive path (which reassigns the full window separately).
   */
  readonly observationAssignments: readonly ReassignTaxonomyObservationByIdInput[]
  /** Scoped write target: the `taxonomy_view_assignments` slice. Empty on the global/adaptive path. */
  readonly customAssignments: readonly TaxonomyViewAssignment[]
  /** Leaf id + centroid for adaptive full-window routing. Empty on the off path. */
  readonly leafClusters: readonly StagingLeafCluster[]
  /**
   * The clusters this plan saves as `staging` — what the atomic swap activates
   * once they are named and ClickHouse points at them. Empty only when nothing
   * fresh was staged (a view's off path, which upserts active rows in place).
   */
  readonly stagedClusterIds: readonly TaxonomyClusterId[]
  /**
   * Sample members per leaf, so a `staging` leaf can be named before the
   * reassignment gives it any `assigned_cluster_id` rows. Bounded by the
   * clustering sample cap.
   */
  readonly namingMembers: readonly TaxonomyClusterNamingMembers[]
  /**
   * Prior state of the rows this plan upserts in place (static continuations,
   * which keep their id). Empty on the adaptive path, which never touches a live
   * row. Cleanup restores these when a publish fails before the swap.
   */
  readonly continuedRestore: readonly TaxonomyContinuedRestore[]
  /** Non-null ⇒ the plan's scope is this cohort. */
  readonly customBehaviorId: CustomBehaviorId | null
  /** Non-null ⇒ the plan's facet is this facet. Any non-null id here (or a non-null
   * `customBehaviorId`) means the plan writes the `taxonomy_view_assignments` slice. */
  readonly facetId: FacetId | null
  /**
   * Death lineage targets — previously-active clusters no node continued. On the
   * off path this is exactly what gets deprecated.
   */
  readonly deprecatedClusterIds: readonly TaxonomyClusterId[]
  /**
   * The full old active tree the staging tree replaces (adaptive only; empty on
   * off). The atomic swap deprecates exactly these ids and activates the staging
   * clusters, so the operation is idempotent under Temporal activity retries.
   */
  readonly supersededClusterIds: readonly TaxonomyClusterId[]
  /** Bounded adaptive-build diagnostics for telemetry; null on the off path. */
  readonly decisionMetadata: RelativeClusteringDiagnostics | null
  /**
   * Non-null ⇒ enforced planning rejected the adaptive tree and persisted static
   * instead (structural or non-finite violation, or a failed build). Resolved
   * before staging/writes, so downstream publish is the plain static path even
   * under an `enforced` mode.
   */
  readonly fallbackReason: TaxonomyAdaptiveFallbackReason | null
  /**
   * Wall-clock of whichever build ran; 0 for the one that did not. Exactly one
   * builder runs per pass, so on an adaptive run `staticDurationMs` is 0 unless
   * adaptive was rejected and static built the fallback.
   *
   * A FAILED adaptive build still reports the time it burned before failing —
   * distinguishing a builder that threw immediately from one the worker deadline
   * killed is the whole diagnosis, and reporting 0 for both hides it.
   */
  readonly adaptiveDurationMs: number
  readonly staticDurationMs: number
  /**
   * Message of the failure behind a `buildError`, for the span. The adaptive build
   * is caught and degraded to a static fallback, so this is the only channel that
   * carries WHY — `Effect.logError` does not reach Datadog from here.
   */
  readonly adaptiveBuildError: string | null
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
  /** NULL = whole-project scope; non-null scopes the row to a cohort's sub-tree. */
  readonly customBehaviorId?: CustomBehaviorId | null
  /** NULL = topic; non-null scopes the row to a facet's tree. */
  readonly facetId?: FacetId | null
  readonly dimension: TaxonomyDimensionType
  readonly parentId: string | null
  readonly path: string
  readonly depth: number
  readonly splitLinkThreshold: number | null
  /** `active` on the off path; `staging` on the adaptive path until the swap. */
  readonly state: TaxonomyClusterState
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
    facetId: input.facetId ?? null,
    dimension: input.dimension,
    parentClusterId: input.parentId === null ? null : TaxonomyClusterId(input.parentId),
    depth: input.depth,
    path: input.path,
    splitLinkThreshold: input.splitLinkThreshold,
    name: input.name,
    description: input.description,
    centroid,
    observationCount: input.memberCount,
    state: input.state,
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
  readonly childCount: number
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
    // The relative builder attaches a member-confidence threshold per interior
    // node; the static (off) path has none, so fall back to the sibling-cosine
    // `computeSplitLinkThreshold` — byte-identical to pre-change.
    splitLinkThreshold: node.splitLinkThreshold ?? computeSplitLinkThreshold(node.children),
    memberIndices: node.memberIndices,
    isLeaf: node.children.length === 0,
    childCount: node.children.length,
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
  /** Final ids that ARE a live active row (a static-persist continuation upserted in place). */
  readonly reusedIds: ReadonlySet<string>
  /** Old ids a new node continued — the rest are deaths, in both modes. */
  readonly matchedOldIds: ReadonlySet<string>
}

const resolveTaxonomyLineage = (input: {
  readonly descriptors: readonly NodeDescriptor[]
  readonly previouslyActive: readonly TaxonomyCluster[]
  /**
   * Whether this run actually stages an adaptive tree. Off and an adaptive run
   * that fell back to static both persist the static tree in place, so they reuse
   * continued ids (byte-identical to the pre-change path); only a
   * genuinely-persisted adaptive tree gives every node a fresh id and carries
   * continuity through the lineage rows.
   */
  readonly persistAdaptive: boolean
}): ResolvedTaxonomyLineage => {
  const oldById = new Map(input.previouslyActive.map((cluster) => [cluster.id as string, cluster] as const))
  // Old-cluster shape, derived from the flat previously-active set: a cluster is
  // interior iff another active cluster points at it as parent.
  const oldChildCount = new Map<string, number>()
  for (const cluster of input.previouslyActive) {
    if (cluster.parentClusterId === null) continue
    const parent = cluster.parentClusterId as string
    oldChildCount.set(parent, (oldChildCount.get(parent) ?? 0) + 1)
  }
  const match = matchTaxonomyLineage({
    newNodes: input.descriptors.map((node) => ({
      tempId: node.tempId,
      depth: node.depth,
      centroid: node.centroid,
      isLeaf: node.isLeaf,
      childCount: node.childCount,
    })),
    oldClusters: input.previouslyActive.map((cluster) => {
      const childCount = oldChildCount.get(cluster.id as string) ?? 0
      return {
        id: cluster.id,
        depth: cluster.depth,
        centroid: normalizeTaxonomyCentroid(cluster.centroid),
        isLeaf: childCount === 0,
        childCount,
      }
    }),
    continuationThreshold: TAXONOMY_CONTINUATION_THRESHOLD,
    nameReuseThreshold: TAXONOMY_NAME_REUSE_THRESHOLD,
    shapeAwareNaming: input.persistAdaptive,
  })
  const decisionByTempId = new Map(match.decisions.map((decision) => [decision.tempId, decision] as const))
  const finalIdByTempId = new Map<string, string>()
  const reusedIds = new Set<string>()
  for (const node of input.descriptors) {
    const decision = decisionByTempId.get(node.tempId)
    // Static-persist runs (off, adaptive-fallback) reuse the continued id
    // in place (id-keyed trend continuity). A persisted adaptive tree stages a
    // fresh tree that atomically replaces the old one, so every staging node gets
    // a fresh id and continuity is carried by the lineage rows, not the literal id
    // — a live upsert onto a reused id would collapse the old tree before the swap.
    const reuse = decision?.transition === "continuation" && !input.persistAdaptive
    const finalId = reuse ? decision.reuseId : generateId()
    if (reuse) reusedIds.add(finalId)
    finalIdByTempId.set(node.tempId, finalId)
  }
  return { oldById, decisionByTempId, finalIdByTempId, reusedIds, matchedOldIds: match.matchedOldIds }
}

export const planHierarchicalTaxonomyUseCase = (input: PlanHierarchicalTaxonomyInput) =>
  Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("taxonomy.projectId", input.projectId)
    yield* Effect.annotateCurrentSpan("taxonomy.runId", input.runId)
    const now = input.now ?? new Date()
    const dimension = input.dimension ?? TaxonomyDimension.Topic
    const mode = input.mode ?? TAXONOMY_ADAPTIVE_CLUSTERING_MODE_DEFAULT
    // `buildAdaptive` decides which builder this pass attempts; `persistAdaptive`
    // (resolved after the build + fallback check) decides whether its output is
    // what we persist, or whether static builds the fallback tree instead.
    const buildAdaptive = isAdaptiveModeActive(mode)
    const embeddingConfig = yield* resolveEmbeddingConfig()
    const observationsRepo = yield* TaxonomyObservationRepository
    const clustersRepo = yield* TaxonomyClusterRepository
    const scopedBehaviorId = input.customBehaviorId ?? null
    const scopedFacetId = input.facetId ?? null
    const isFacetScoped = scopedFacetId !== null
    // Every view is a custom behavior, so a facet-scoped run is always
    // cohort-wrapped: its edges key on that behavior's id. A facet-scoped run
    // without a behavior would have nowhere to write (whole-project topic is the
    // only behavior-less tree, and it is the inline online tree), so fail fast.
    if (isFacetScoped && scopedBehaviorId === null) {
      return yield* Effect.die(
        new Error(`planHierarchicalTaxonomy: facet ${scopedFacetId} requires a customBehaviorId`),
      )
    }
    // A cohort on the TOPIC path samples the observation window through its
    // filter, so it needs a non-empty filter (sampling the whole project yet
    // tagging the cohort would be silently wrong). A facet-scoped run samples +
    // extracts in the caller, so it needs no filter here even when cohort-scoped.
    if (
      !isFacetScoped &&
      scopedBehaviorId !== null &&
      (!input.filterSet || Object.keys(input.filterSet).length === 0)
    ) {
      return yield* Effect.die(
        new Error(`planHierarchicalTaxonomy: scoped run for ${scopedBehaviorId} requires a non-empty filterSet`),
      )
    }
    const since = lookbackStart(now)
    // The facet path picks the embeddings to cluster: a facet-scoped run clusters
    // the caller-supplied facet projections; the topic path samples observation
    // embeddings, scoped to the cohort's FilterSet session slice or the whole
    // project window. Scoped/facet rows carry sessionId for the view-slice write.
    const observations: readonly TaxonomyClusteringObservation[] = isFacetScoped
      ? (input.facetObservations ?? [])
      : scopedBehaviorId
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
    // Any view (cohort topic or facet, both behavior-wrapped) reports its own
    // sample size; only the whole-project topic tree reads project-wide counts.
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
        topLevelClustersBuilt: 0,
        lineage: [],
        clusters: [],
        observationAssignments: [],
        customAssignments: [],
        leafClusters: [],
        stagedClusterIds: [],
        namingMembers: [],
        continuedRestore: [],
        customBehaviorId: scopedBehaviorId,
        facetId: scopedFacetId,
        deprecatedClusterIds: [],
        supersededClusterIds: [],
        mode,
        decisionMetadata: null,
        fallbackReason: null,
        adaptiveDurationMs: 0,
        staticDurationMs: 0,
        adaptiveBuildError: null,
      } satisfies HierarchicalTaxonomyPlan
    }

    const normalizedEmbeddings = observations.map((observation) => normalizeTaxonomyEmbedding(observation.embedding))
    const clusterBuilder =
      input.clusterBuilder ??
      ((request: TaxonomyClusterBuildRequest) => Effect.sync(() => runTaxonomyClusterBuild(request)))
    // Seed is deterministic per view (project × scope × facet) so a pass replays
    // identically under Temporal and different views never share a seed.
    const seed = seedFromProjectId(
      `${input.projectId}${scopedBehaviorId ? `:${scopedBehaviorId}` : ""}${scopedFacetId ? `:facet:${scopedFacetId}` : ""}`,
    )

    // The adaptive build is best-effort: a builder failure (worker crash,
    // timeout, thrown error) degrades to `null` rather than aborting the whole
    // garden, so the run can still fall back to the static tree.
    // Catch INSIDE the timing so a failure keeps its elapsed time: a build the
    // worker deadline killed and one that threw on arrival are the same
    // `buildError` otherwise, and telling them apart is the whole diagnosis.
    const adaptiveTimed = buildAdaptive
      ? yield* Effect.timed(
          clusterBuilder({ mode, embeddings: normalizedEmbeddings, seed }).pipe(
            Effect.map((build) => ({ build, error: null as string | null })),
            Effect.catch((error) => Effect.succeed({ build: null, error: error.message })),
          ),
        )
      : null
    const adaptiveBuild = adaptiveTimed?.[1].build ?? null
    const adaptiveBuildError = adaptiveTimed?.[1].error ?? null
    const adaptiveDurationMs = adaptiveTimed ? Duration.toMillis(adaptiveTimed[0]) : 0

    // Fallback selection, here in the planning use case BEFORE any staging/writes:
    // adaptive is persisted only when a finite, structurally sane tree was
    // actually built. A missing adaptive build (builder failure) is `buildError`.
    const fallbackReason: TaxonomyAdaptiveFallbackReason | null = buildAdaptive
      ? adaptiveBuild
        ? adaptiveFallbackReason({
            root: adaptiveBuild.root,
            diagnostics: adaptiveBuild.diagnostics,
            maxDepth: TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE.length,
            maxNodes: TAXONOMY_ADAPTIVE_STRUCTURAL_MAX_NODES,
          })
        : "buildError"
      : null

    const acceptedAdaptiveBuild = fallbackReason === null ? adaptiveBuild : null
    const persistAdaptive = acceptedAdaptiveBuild !== null
    // Exactly one tree per pass: static runs only when it is the tree we persist —
    // the `off` path, or an adaptive run whose output was rejected. A static build
    // failure IS fatal (nothing left to persist), so unlike adaptive it is uncaught.
    const persisted = acceptedAdaptiveBuild
      ? { build: acceptedAdaptiveBuild, staticDurationMs: 0 }
      : yield* Effect.timed(clusterBuilder({ mode: "off", embeddings: normalizedEmbeddings, seed })).pipe(
          Effect.map(([elapsed, build]) => ({ build, staticDurationMs: Duration.toMillis(elapsed) })),
        )
    const staticDurationMs = persisted.staticDurationMs
    // On the whole-project topic tree a fresh id is born `staging`: it becomes
    // visible to reads only in the swap, once it is named AND ClickHouse points
    // at it. A reused id (a static-persist continuation) IS the live row, so it
    // stays active and keeps serving its subtree across the rebuild. A view names
    // from its assignment slice, which the reassignment writes after naming would
    // run, so views keep publishing as before.
    const isView = scopedBehaviorId !== null || scopedFacetId !== null
    const freshClusterState: TaxonomyClusterState = persistAdaptive || !isView ? "staging" : "active"
    const tree = persisted.build.root

    const descriptors: NodeDescriptor[] = []
    collectNodes(tree, null, { value: 0 }, descriptors)

    const previouslyActive = yield* clustersRepo.listActiveByProject({
      projectId: input.projectId,
      dimension,
      ...(input.customBehaviorId ? { customBehaviorId: input.customBehaviorId } : {}),
      ...(input.facetId ? { facetId: input.facetId } : {}),
    })
    const { oldById, decisionByTempId, finalIdByTempId, reusedIds, matchedOldIds } = resolveTaxonomyLineage({
      descriptors,
      previouslyActive,
      persistAdaptive,
    })

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
        facetId: input.facetId ?? null,
        dimension,
        parentId: parentFinalId,
        path,
        depth: node.depth,
        splitLinkThreshold: node.splitLinkThreshold,
        state: reusedIds.has(finalId) ? "active" : freshClusterState,
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

    // Off writes the sample assignments here (sample-only reassignment). Adaptive
    // reassigns the FULL bounded live window in a later activity, routing every
    // window observation to these leaf centroids — so it publishes `leafClusters`
    // instead and leaves both sample-assignment arrays empty.
    const leafClusters: StagingLeafCluster[] = persistAdaptive
      ? bornLeaves.map((leaf) => ({ clusterId: leaf.clusterId, centroid: [...leaf.centroid] }))
      : []

    // Two write targets, picked by view: only the whole-project topic tree
    // reassigns the observation's `assigned_cluster_id`; every behavior-wrapped
    // view (cohort topic or facet) writes the `taxonomy_view_assignments` slice
    // (keyed by customBehaviorId × facetId, carrying sessionId), never the column.
    const observationAssignments: ReassignTaxonomyObservationByIdInput[] =
      persistAdaptive || scopedBehaviorId
        ? []
        : leafMembers.map(({ leaf, observation, confidence }) => ({
            observationId: observation.observationId,
            assignedClusterId: leaf.clusterId,
            assignmentMethod: "gardening_birth" as const,
            assignmentConfidence: confidence,
            reassignmentRunId: input.runId,
            indexedAt: now,
          }))
    const customAssignments: TaxonomyViewAssignment[] =
      !persistAdaptive && scopedBehaviorId
        ? leafMembers.flatMap(({ leaf, observation, confidence }) => {
            // Scoped/facet samples carry a sessionId; guard at runtime (via a
            // widening cast, not an unchecked one) so a whole-project topic
            // observation can never yield a `sessionId: undefined` assignment.
            const sessionId = (observation as Partial<TaxonomyScopedClusteringObservation>).sessionId
            if (sessionId === undefined) return []
            return [
              {
                organizationId: input.organizationId,
                projectId: input.projectId,
                customBehaviorId: scopedBehaviorId,
                facetId: scopedFacetId,
                observationId: observation.observationId,
                sessionId,
                assignedClusterId: leaf.clusterId,
                assignmentConfidence: confidence,
                assignmentMethod: "gardening_birth" as const,
                reassignmentRunId: input.runId,
                startTime: observation.startTime,
                retentionDays: TAXONOMY_OBSERVATION_RETENTION_DAYS,
                indexedAt: now,
              } satisfies TaxonomyViewAssignment,
            ]
          })
        : []

    // Deprecate every old cluster no new node continued. Keyed on the matcher's
    // `matchedOldIds` (not on final id equality) so it is correct in adaptive
    // mode too, where continuations get fresh ids and never appear among them.
    const deprecatedClusterIds: TaxonomyClusterId[] = []
    for (const cluster of previouslyActive) {
      if (matchedOldIds.has(cluster.id)) continue
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
      topLevelClustersBuilt: tree.children.length,
      lineage,
      clusters: bornClusters,
      observationAssignments,
      customAssignments,
      leafClusters,
      stagedClusterIds: bornClusters
        .filter((cluster) => cluster.state === "staging")
        .map((cluster) => cluster.id as TaxonomyClusterId),
      namingMembers: bornLeaves.map((leaf) => ({
        clusterId: leaf.clusterId as TaxonomyClusterId,
        observationIds: leaf.observationIndices.flatMap((index) => {
          const observationId = observations[index]?.observationId
          return observationId === undefined ? [] : [observationId]
        }),
      })),
      continuedRestore: [...reusedIds].flatMap((clusterId) => {
        const previous = oldById.get(clusterId)
        if (previous === undefined) return []
        return [
          {
            clusterId: previous.id,
            parentClusterId: previous.parentClusterId,
            path: previous.path,
            depth: previous.depth,
            name: previous.name,
            description: previous.description,
          } satisfies TaxonomyContinuedRestore,
        ]
      }),
      customBehaviorId: scopedBehaviorId,
      facetId: scopedFacetId,
      deprecatedClusterIds,
      supersededClusterIds: persistAdaptive ? previouslyActive.map((cluster) => cluster.id) : [],
      mode,
      decisionMetadata: adaptiveBuild?.diagnostics ?? null,
      fallbackReason,
      adaptiveDurationMs,
      staticDurationMs,
      adaptiveBuildError,
    } satisfies HierarchicalTaxonomyPlan
  }).pipe(Effect.withSpan("taxonomy.planHierarchicalTaxonomy"))
