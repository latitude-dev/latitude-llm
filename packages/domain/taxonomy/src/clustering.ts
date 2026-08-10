/**
 * Pure clustering primitives for the divisive hierarchical taxonomy build.
 *
 * Inputs are L2-normalized embeddings (voyage-4-large, 2048d). On unit vectors
 * cosine similarity equals the dot product, so all distance work below uses
 * dot products and the centroid update is "mean then re-normalize" (spherical
 * k-means). No dependency on Effect or repositories — everything here is
 * deterministic given the input.
 *
 * Two builders share the same k-means core and differ only in the split-
 * acceptance gate. Neither is a "default" — every caller picks explicitly:
 *
 *   - `buildRelativeHierarchicalClusters` uses node-relative separation: each
 *     candidate split is judged against the spread of its own members, so
 *     acceptance adapts to the semantic density of the corpus rather than a
 *     fixed absolute sibling-cosine. It also returns bounded diagnostics.
 *   - `buildStaticHierarchicalClusters` keeps the absolute sibling-cosine gate.
 *     It is the current production path and the baseline the calibration
 *     harness regresses against; the rollout switches to the relative builder
 *     through the mode gate, and the static path is removed once the relative
 *     builder is the enforced default.
 *
 * Algorithm (high level):
 *   - At every tree node we sweep K = 2..maxChildrenAtThisDepth. For each K we
 *     run spherical k-means++ a few times and keep the best restart by
 *     Calinski–Harabasz (variance-ratio criterion adapted to cosine).
 *   - We reject Ks that violate the per-depth gate. If no K is valid the node
 *     stays a leaf.
 *   - We then recurse into each child cluster with depth+1 and the next entry
 *     in the depth schedule.
 *
 * Why bisecting K-means with auto-K instead of HDBSCAN / single-linkage:
 *   - We rebuild the whole tree per gardening pass over a bounded sample
 *     (≤1.5k) and want a single algorithmic primitive that gives both a
 *     coarse-to-fine partition AND a stable per-node centroid suitable for
 *     online assignment. Spherical k-means satisfies both. HDBSCAN is not
 *     ergonomic in JS and produces clusters that don't carry well-defined
 *     centroids for the online deepest-fit router we already ship.
 *   - Per-depth schedules are the cheapest way to express "broad at the root,
 *     narrow at the leaves" without per-corpus hand tuning.
 */

import { normalizeEmbedding } from "@domain/shared"
import { cosineSimilarityNormalized } from "./helpers.ts"

/**
 * Node-relative split policy. Scale-free: a broad support corpus and a narrow
 * specialized corpus are governed by the same numbers because acceptance is
 * judged relative to each node's own geometry.
 */
export interface RelativeDepthSchedule {
  /** Maximum K to try at this depth. K=2..maxChildren is swept. */
  readonly maxChildren: number
  /** Minimum cluster size as a fraction of the parent's member count. */
  readonly minClusterFraction: number
  /** Absolute floor on cluster size at this depth — overrides the fraction. */
  readonly minClusterAbs: number
  /**
   * Minimum Calinski–Harabasz improvement (vs. K=1 / no split) required to
   * accept a split at this depth. Higher → more aggressive leaf-keeping.
   * Expressed as the variance-ratio criterion itself; a node is left a leaf
   * when the best K's score is below this.
   */
  readonly minSplitScore: number
  /** A split where one child holds more than this fraction of the parent is not a real split. */
  readonly maxDominantChildFraction: number
  /** Closest-sibling distance must be at least this multiple of the within-child spread. */
  readonly minRelativeSeparation: number
  /** Quantile of member-to-own-centroid distance used as the within-child spread. */
  readonly withinDistanceQuantile: number
  /** Lower-tail quantile of member-to-own-centroid similarity used to set the routing threshold. */
  readonly routingSimilarityQuantile: number
}

/**
 * Absolute-sibling-cosine split policy for the static baseline builder.
 */
export interface StaticDepthSchedule {
  readonly maxChildren: number
  readonly minClusterFraction: number
  readonly minClusterAbs: number
  /**
   * Two sibling centroids closer than this cosine cannot coexist at this depth.
   * The full K is rejected when any pair exceeds it.
   */
  readonly maxSiblingCosine: number
  readonly minSplitScore: number
}

export interface ClusteringTreeNode {
  /** Indices into the original `embeddings` array — *all* members at this node. */
  readonly memberIndices: readonly number[]
  /** Normalized centroid over `memberIndices`. */
  readonly centroid: readonly number[]
  /** Empty for leaves. */
  readonly children: readonly ClusteringTreeNode[]
  readonly depth: number
  /**
   * Member-confidence descent gate for this node's children, set only by the
   * relative builder (undefined on static-builder nodes and on leaves). The
   * planner persists it verbatim so the online router reads the derived
   * threshold at descent time instead of recomputing from sibling centroids.
   */
  readonly splitLinkThreshold?: number
}

export interface BuildRelativeHierarchicalClustersInput {
  /** L2-normalized embeddings; all same dimension. */
  readonly embeddings: readonly (readonly number[])[]
  /** One entry per depth (depth 0 = root). When recursion exceeds the array
   *  length the node becomes a leaf. */
  readonly depthSchedule: readonly RelativeDepthSchedule[]
  /** K-means++ restarts per K sweep. */
  readonly restarts: number
  /** K-means iterations cap. */
  readonly maxIter: number
  /** Tolerance for k-means convergence (max centroid drift). */
  readonly tolerance: number
  /** Random seed — pass a project-stable value for run-to-run stability. */
  readonly seed: number
  /** Global absolute floor on the per-split routing threshold (mirrors TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD). */
  readonly globalAbsoluteThreshold: number
  /**
   * Re-search budget for a root split that lands near the separation gate. Omit
   * to disable, which makes the build byte-identical to a plain `restarts` run.
   */
  readonly escalation?: RelativeClusteringEscalation
}

/**
 * Both fields are explicit inputs rather than module constants so the builder
 * stays a pure function of its arguments — a Temporal replay of the same request
 * must reproduce the same tree.
 */
export interface RelativeClusteringEscalation {
  /**
   * Restart budget for the re-searched ROOT split. Deeper nodes keep the plain
   * `restarts`: the band that triggers a re-search is measured on the root alone,
   * so spending the larger budget at every depth buys nothing the gate asked for
   * and multiplies the cost of the whole tree instead of one node's K sweep.
   */
  readonly restarts: number
  /** Best observed root separation at or above which the first pass is kept. */
  readonly marginThreshold: number
  /** Below this the corpus has no structure to find and the re-search is skipped. */
  readonly marginFloor: number
  /** How many K the re-search sweeps, best-scoring first. */
  readonly searchWidth: number
  /**
   * Ceiling on the PROJECTED cost of the root sweeps, in dot-product element
   * operations. A count rather than a duration on purpose: the builder must stay a
   * pure function of its inputs, and a wall-clock check would take a different
   * branch on a slower host and so break Temporal replay. Derived from the worker
   * deadline and a measured throughput — see TAXONOMY_ADAPTIVE_ESCALATION_MAX_WORK.
   */
  readonly maxSearchWork: number
}

export interface BuildStaticHierarchicalClustersInput {
  readonly embeddings: readonly (readonly number[])[]
  readonly depthSchedule: readonly StaticDepthSchedule[]
  readonly restarts: number
  readonly maxIter: number
  readonly tolerance: number
  readonly seed: number
}

export type RelativeClusteringRejectionReason =
  | "undersizedChild"
  | "dominantChild"
  | "lowScore"
  | "lowRelativeSeparation"

/**
 * Bounded, embedding-free summary of one relative build. Every field is either
 * a scalar or an array bounded by the node count (≤ the structural node cap), so
 * it is safe to log or thread through telemetry without leaking member data.
 */
export interface RelativeClusteringDiagnostics {
  /** Selected K per accepted split, keyed by depth (depth → [K, ...]). */
  readonly selectedKByDepth: Record<number, number[]>
  readonly nodeCount: number
  readonly leafCount: number
  readonly maxDepth: number
  readonly acceptedSplits: number
  readonly rejectedCandidates: number
  readonly rejectionReasonCounts: Record<RelativeClusteringRejectionReason, number>
  /** Relative separation of every accepted split — for percentile summaries. */
  readonly acceptedRelativeSeparations: number[]
  /** Member-confidence routing threshold of every accepted split. */
  readonly routingThresholds: number[]
  /** True when a non-finite relative metric slipped through (fallback trigger for later phases). */
  readonly fellBackToStatic: boolean
  /**
   * Best relative separation any ROOT candidate reached, accepted or rejected.
   * Distinguishes a corpus with no structure at all (well under the gate) from
   * one whose real split merely fell short on this run — the accepted-splits
   * percentiles cannot, since a collapsed root contributes nothing to them.
   */
  readonly bestRootSeparation: number
  /** True when the root landed near the separation gate and the build was re-searched. */
  readonly escalated: boolean
  /**
   * True when the band asked for a re-search and the projected work budget refused
   * it. Distinguishes "no re-search was needed" from "one was needed and declined",
   * which is otherwise invisible: both return the first pass.
   */
  readonly escalationSkipped: boolean
  /**
   * Upper bound on the dot-product element operations the root sweeps would cost,
   * as the budget check saw it. Reported so the throughput constant behind
   * `maxSearchWork` can be retuned against production rather than re-derived.
   */
  readonly projectedRootSearchWork: number
}

export interface BuildRelativeHierarchicalClustersResult {
  readonly root: ClusteringTreeNode
  readonly diagnostics: RelativeClusteringDiagnostics
}

// ---------------------------------------------------------------------------
// PRNG — mulberry32. We need a deterministic, seedable PRNG so a gardening
// pass on the same observation sample produces the same tree across retries.
// Math.random would diverge between activity attempts and Temporal replays.
// ---------------------------------------------------------------------------

const createRng = (seed: number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------------------------------------------------------------------------
// Mean + normalize over an index set — used as the centroid update step in
// spherical k-means and at every tree node to publish a stable centroid.
// ---------------------------------------------------------------------------

const meanOverIndices = (
  embeddings: readonly (readonly number[])[],
  indices: readonly number[],
  dimensions: number,
): number[] => {
  if (indices.length === 0) return []
  const sum = new Array<number>(dimensions).fill(0)
  for (const memberIndex of indices) {
    const vector = embeddings[memberIndex]
    if (!vector || vector.length !== dimensions) continue
    for (let i = 0; i < dimensions; i++) sum[i] = (sum[i] ?? 0) + (vector[i] ?? 0)
  }
  return normalizeEmbedding(sum)
}

// ---------------------------------------------------------------------------
// k-means++ initialization adapted to cosine. Pick the first center
// uniformly, then iteratively pick centers with probability proportional to
// (1 - max-similarity-to-already-picked)². This biases initial centers to be
// far apart on the cosine sphere, which is what we want.
// ---------------------------------------------------------------------------

const kmeansPlusPlusInit = (
  embeddings: readonly (readonly number[])[],
  memberIndices: readonly number[],
  k: number,
  rng: () => number,
): number[][] => {
  const n = memberIndices.length
  if (n === 0 || k <= 0) return []
  const dimensions = embeddings[memberIndices[0] ?? 0]?.length ?? 0
  if (dimensions === 0) return []

  const seedIndex = memberIndices[Math.floor(rng() * n)] ?? memberIndices[0] ?? 0
  const seedVector = embeddings[seedIndex]
  if (!seedVector) return []

  const centers: number[][] = [[...seedVector]]
  const minDistance = new Array<number>(n).fill(Number.POSITIVE_INFINITY)
  for (let localIdx = 0; localIdx < n; localIdx++) {
    const vector = embeddings[memberIndices[localIdx] ?? -1]
    if (!vector) continue
    minDistance[localIdx] = 1 - cosineSimilarityNormalized(vector, seedVector)
  }

  while (centers.length < k) {
    let total = 0
    for (let i = 0; i < n; i++) total += (minDistance[i] ?? 0) ** 2
    if (total <= 0) break
    let target = rng() * total
    let chosen = 0
    for (let i = 0; i < n; i++) {
      target -= (minDistance[i] ?? 0) ** 2
      if (target <= 0) {
        chosen = i
        break
      }
    }
    const newCenterVector = embeddings[memberIndices[chosen] ?? -1]
    if (!newCenterVector) break
    centers.push([...newCenterVector])
    for (let i = 0; i < n; i++) {
      const vector = embeddings[memberIndices[i] ?? -1]
      if (!vector) continue
      const distance = 1 - cosineSimilarityNormalized(vector, newCenterVector)
      const current = minDistance[i] ?? Number.POSITIVE_INFINITY
      if (distance < current) minDistance[i] = distance
    }
  }

  return centers
}

// ---------------------------------------------------------------------------
// Spherical k-means: assign by max cosine, update centers by mean+normalize.
// Returns assignments (local index → cluster index) and final centroids.
// ---------------------------------------------------------------------------

interface KmeansResult {
  /** assignments[localIndex] = clusterIndex */
  readonly assignments: readonly number[]
  readonly centroids: readonly (readonly number[])[]
}

const sphericalKmeans = (input: {
  readonly embeddings: readonly (readonly number[])[]
  readonly memberIndices: readonly number[]
  readonly initialCentroids: readonly (readonly number[])[]
  readonly maxIter: number
  readonly tolerance: number
}): KmeansResult => {
  const { embeddings, memberIndices, initialCentroids, maxIter, tolerance } = input
  const n = memberIndices.length
  const k = initialCentroids.length
  const assignments = new Array<number>(n).fill(0)
  let centroids = initialCentroids.map((vector) => [...vector])
  for (let iteration = 0; iteration < maxIter; iteration++) {
    let changed = false
    for (let localIdx = 0; localIdx < n; localIdx++) {
      const vector = embeddings[memberIndices[localIdx] ?? -1]
      if (!vector) continue
      let bestCluster = 0
      let bestSimilarity = Number.NEGATIVE_INFINITY
      for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
        const centroid = centroids[clusterIdx]
        if (!centroid) continue
        const similarity = cosineSimilarityNormalized(vector, centroid)
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity
          bestCluster = clusterIdx
        }
      }
      if (assignments[localIdx] !== bestCluster) {
        assignments[localIdx] = bestCluster
        changed = true
      }
    }
    const dimensions = centroids[0]?.length ?? 0
    const newCentroids: number[][] = []
    for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
      const memberLocalIndices: number[] = []
      for (let localIdx = 0; localIdx < n; localIdx++) {
        if (assignments[localIdx] === clusterIdx) memberLocalIndices.push(memberIndices[localIdx] ?? -1)
      }
      const updated =
        memberLocalIndices.length > 0
          ? meanOverIndices(embeddings, memberLocalIndices, dimensions)
          : (centroids[clusterIdx] ?? [])
      newCentroids.push([...updated])
    }
    let maxDrift = 0
    for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
      const before = centroids[clusterIdx]
      const after = newCentroids[clusterIdx]
      if (!before || !after) continue
      const drift = 1 - cosineSimilarityNormalized(before, after)
      if (drift > maxDrift) maxDrift = drift
    }
    centroids = newCentroids
    if (!changed || maxDrift <= tolerance) break
  }
  return { assignments, centroids }
}

// ---------------------------------------------------------------------------
// Calinski–Harabasz adapted to cosine. We treat (1 - cosine) as squared
// distance on the unit sphere; the ratio of "between" to "within" mean
// distances multiplied by (n-k)/(k-1) gives a normalized score where higher
// = better-separated. This avoids paying for an O(n²) silhouette per K.
// ---------------------------------------------------------------------------

const calinskiHarabaszScore = (
  embeddings: readonly (readonly number[])[],
  memberIndices: readonly number[],
  assignments: readonly number[],
  centroids: readonly (readonly number[])[],
): number => {
  const n = memberIndices.length
  const k = centroids.length
  if (n <= k || k <= 1) return 0
  const dimensions = centroids[0]?.length ?? 0
  const overallCentroid = meanOverIndices(embeddings, memberIndices, dimensions)
  let between = 0
  let within = 0
  for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
    const centroid = centroids[clusterIdx]
    if (!centroid) continue
    let clusterSize = 0
    for (let localIdx = 0; localIdx < n; localIdx++) {
      if (assignments[localIdx] !== clusterIdx) continue
      clusterSize++
      const vector = embeddings[memberIndices[localIdx] ?? -1]
      if (!vector) continue
      within += 1 - cosineSimilarityNormalized(vector, centroid)
    }
    if (clusterSize === 0) continue
    between += clusterSize * (1 - cosineSimilarityNormalized(centroid, overallCentroid))
  }
  if (within <= 0) return 0
  return between / (k - 1) / (within / (n - k))
}

// ---------------------------------------------------------------------------
// Relative-separation metric helpers (spec "Adaptive split algorithm").
// ---------------------------------------------------------------------------

/** Clamp a cosine distance (1 - cosine) to the valid [0, 2] range. */
const clampDistance = (distance: number): number => {
  if (distance < 0) return 0
  if (distance > 2) return 2
  return distance
}

/** Quantile with linear interpolation at position (n - 1) * q. Input need not be sorted. */
export const quantile = (values: readonly number[], q: number): number => {
  const n = values.length
  if (n === 0) return 0
  if (n === 1) return values[0] ?? 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (n - 1) * Math.min(1, Math.max(0, q))
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lower = sorted[lowerIndex] ?? 0
  const upper = sorted[upperIndex] ?? lower
  if (lowerIndex === upperIndex) return lower
  return lower + (upper - lower) * (position - lowerIndex)
}

// ---------------------------------------------------------------------------
// chooseBestRelativeK — sweep K, run multi-restart spherical k-means, accept
// the K that maximizes CH score while satisfying the node-relative gate:
// minimum child size, dominant-child protection, minimum split score, and
// relative separation.
//
// Tie-breaking is deterministic: K is swept ascending and restarts run in
// order, and `best` is replaced only on a *strictly* greater score, so an
// exact CH tie keeps the lower K and, within a K, the earlier restart.
// ---------------------------------------------------------------------------

interface RelativeCandidate {
  readonly k: number
  readonly assignments: readonly number[]
  readonly centroids: readonly (readonly number[])[]
  readonly score: number
  readonly relativeSeparation: number
  readonly splitLinkThreshold: number
  readonly clusterMemberIndices: readonly (readonly number[])[]
}

interface ChooseBestRelativeKInput {
  readonly embeddings: readonly (readonly number[])[]
  readonly memberIndices: readonly number[]
  readonly schedule: RelativeDepthSchedule
  readonly restarts: number
  readonly maxIter: number
  readonly tolerance: number
  readonly globalAbsoluteThreshold: number
  readonly rng: () => number
  readonly onReject: (reason: RelativeClusteringRejectionReason) => void
  /** Every candidate that reached the separation gate, accepted or not. */
  readonly onCandidateSeparation: (relativeSeparation: number) => void
  /** Every candidate that got as far as being scored, accepted or not. */
  readonly onCandidateScore?: (k: number, score: number) => void
  /** When set, only these K are swept; absent sweeps 2..maxChildren. */
  readonly restrictToK?: ReadonlySet<number>
}

/**
 * Size floor and K ceiling for one node's sweep. Shared by the sweep itself and by
 * the budget projection: if these drift apart the projection mis-estimates the cost
 * it is meant to bound.
 */
const sweepBounds = (memberCount: number, schedule: RelativeDepthSchedule) => {
  const minClusterSize = Math.max(schedule.minClusterAbs, Math.ceil(memberCount * schedule.minClusterFraction))
  return { minClusterSize, maxK: Math.min(schedule.maxChildren, Math.floor(memberCount / minClusterSize)) }
}

const chooseBestRelativeK = (input: ChooseBestRelativeKInput): RelativeCandidate | null => {
  const {
    embeddings,
    memberIndices,
    schedule,
    restarts,
    maxIter,
    tolerance,
    globalAbsoluteThreshold,
    rng,
    onReject,
    onCandidateSeparation,
    onCandidateScore,
    restrictToK,
  } = input
  const n = memberIndices.length
  const { minClusterSize, maxK } = sweepBounds(n, schedule)
  if (n < minClusterSize * 2) return null

  let best: RelativeCandidate | null = null
  for (let k = 2; k <= maxK; k++) {
    if (restrictToK && !restrictToK.has(k)) continue
    for (let restart = 0; restart < restarts; restart++) {
      const initial = kmeansPlusPlusInit(embeddings, memberIndices, k, rng)
      if (initial.length !== k) continue
      const { assignments, centroids } = sphericalKmeans({
        embeddings,
        memberIndices,
        initialCentroids: initial,
        maxIter,
        tolerance,
      })

      const clusterMemberIndices: number[][] = Array.from({ length: k }, () => [])
      for (let localIdx = 0; localIdx < n; localIdx++) {
        const cluster = assignments[localIdx] ?? 0
        clusterMemberIndices[cluster]?.push(memberIndices[localIdx] ?? -1)
      }

      let smallestChildSize = Number.POSITIVE_INFINITY
      let largestChildSize = 0
      for (const bucket of clusterMemberIndices) {
        if (bucket.length < smallestChildSize) smallestChildSize = bucket.length
        if (bucket.length > largestChildSize) largestChildSize = bucket.length
      }
      // Undersized child: a micro-cluster that should not be a sibling of the
      // remaining mass at this depth.
      if (smallestChildSize < minClusterSize) {
        onReject("undersizedChild")
        continue
      }

      // Dominant child: one child keeping most of the parent is not a partition.
      const dominantChildFraction = largestChildSize / n
      if (dominantChildFraction > schedule.maxDominantChildFraction) {
        onReject("dominantChild")
        continue
      }

      const score = calinskiHarabaszScore(embeddings, memberIndices, assignments, centroids)
      onCandidateScore?.(k, score)
      if (score < schedule.minSplitScore) {
        onReject("lowScore")
        continue
      }

      // Node-relative separation: the closest sibling pair must sit clearly
      // outside the within-child spread. O(n) member distances + O(K²) sibling
      // distances, K ≤ maxChildren ≤ 10.
      const memberDistances: number[] = []
      for (let localIdx = 0; localIdx < n; localIdx++) {
        const vector = embeddings[memberIndices[localIdx] ?? -1]
        const centroid = centroids[assignments[localIdx] ?? 0]
        if (!vector || !centroid) continue
        memberDistances.push(clampDistance(1 - cosineSimilarityNormalized(vector, centroid)))
      }
      const withinDistance = quantile(memberDistances, schedule.withinDistanceQuantile)

      let closestSiblingDistance = Number.POSITIVE_INFINITY
      for (let i = 0; i < k; i++) {
        const left = centroids[i]
        if (!left) continue
        for (let j = i + 1; j < k; j++) {
          const right = centroids[j]
          if (!right) continue
          const distance = clampDistance(1 - cosineSimilarityNormalized(left, right))
          if (distance < closestSiblingDistance) closestSiblingDistance = distance
        }
      }

      const relativeSeparation = closestSiblingDistance / Math.max(withinDistance, 1e-6)
      onCandidateSeparation(relativeSeparation)
      if (relativeSeparation < schedule.minRelativeSeparation) {
        onReject("lowRelativeSeparation")
        continue
      }

      // Per-child descent threshold: the lower-tail quantile of each child's
      // member-to-own-centroid similarity, floored by the global absolute
      // threshold. Taking the min across children stops a large/easy child from
      // controlling the parent's descent gate.
      const childThresholds: number[] = []
      for (let clusterIdx = 0; clusterIdx < k; clusterIdx++) {
        const centroid = centroids[clusterIdx]
        if (!centroid) continue
        const similarities: number[] = []
        for (let localIdx = 0; localIdx < n; localIdx++) {
          if (assignments[localIdx] !== clusterIdx) continue
          const vector = embeddings[memberIndices[localIdx] ?? -1]
          if (!vector) continue
          similarities.push(cosineSimilarityNormalized(vector, centroid))
        }
        childThresholds.push(quantile(similarities, schedule.routingSimilarityQuantile))
      }
      const minChildThreshold = childThresholds.length > 0 ? Math.min(...childThresholds) : globalAbsoluteThreshold
      const splitLinkThreshold = Math.max(globalAbsoluteThreshold, minChildThreshold)

      if (!best || score > best.score) {
        best = { k, assignments, centroids, score, relativeSeparation, splitLinkThreshold, clusterMemberIndices }
      }
    }
  }
  return best
}

// ---------------------------------------------------------------------------
// Divisive builder — node-relative separation.
// ---------------------------------------------------------------------------

interface RootReSearch {
  /** Restart budget for the ROOT split only; every deeper node keeps `input.restarts`. */
  readonly restarts: number
  /** The only K the root sweeps. Absent sweeps the full 2..maxChildren. */
  readonly restrictToK?: ReadonlySet<number>
}

const buildRelativeOnce = (
  input: BuildRelativeHierarchicalClustersInput,
  rootReSearch?: RootReSearch,
  /** Best score each root K reached, so a re-search can spend its budget on the promising ones. */
  onRootCandidateScore?: (k: number, score: number) => void,
): BuildRelativeHierarchicalClustersResult => {
  const { embeddings, depthSchedule, restarts, maxIter, tolerance, seed, globalAbsoluteThreshold } = input
  const dimensions = embeddings[0]?.length ?? 0
  const allIndices = embeddings
    .map((vector, index) => (vector && vector.length === dimensions ? index : -1))
    .filter((index) => index >= 0)
  const rng = createRng(seed)

  const selectedKByDepth: Record<number, number[]> = {}
  const rejectionReasonCounts: Record<RelativeClusteringRejectionReason, number> = {
    undersizedChild: 0,
    dominantChild: 0,
    lowScore: 0,
    lowRelativeSeparation: 0,
  }
  const acceptedRelativeSeparations: number[] = []
  const routingThresholds: number[] = []
  let nodeCount = 0
  let leafCount = 0
  let maxDepth = 0
  let acceptedSplits = 0
  let rejectedCandidates = 0
  let bestRootSeparation = 0

  const recurse = (memberIndices: readonly number[], depth: number): ClusteringTreeNode => {
    nodeCount++
    if (depth > maxDepth) maxDepth = depth
    const centroid = meanOverIndices(embeddings, memberIndices, dimensions)
    const schedule = depthSchedule[depth]
    if (!schedule || memberIndices.length === 0) {
      leafCount++
      return { memberIndices, centroid, children: [], depth }
    }
    const best = chooseBestRelativeK({
      embeddings,
      memberIndices,
      schedule,
      restarts: depth === 0 && rootReSearch ? rootReSearch.restarts : restarts,
      maxIter,
      tolerance,
      globalAbsoluteThreshold,
      rng,
      ...(depth === 0 && rootReSearch?.restrictToK ? { restrictToK: rootReSearch.restrictToK } : {}),
      onReject: (reason) => {
        rejectedCandidates++
        rejectionReasonCounts[reason]++
      },
      onCandidateSeparation: (relativeSeparation) => {
        if (depth === 0 && relativeSeparation > bestRootSeparation) bestRootSeparation = relativeSeparation
      },
      ...(onRootCandidateScore
        ? {
            onCandidateScore: (k: number, score: number) => {
              if (depth === 0) onRootCandidateScore(k, score)
            },
          }
        : {}),
    })
    if (!best) {
      leafCount++
      return { memberIndices, centroid, children: [], depth }
    }
    acceptedSplits++
    const depthKs = selectedKByDepth[depth] ?? []
    depthKs.push(best.k)
    selectedKByDepth[depth] = depthKs
    acceptedRelativeSeparations.push(best.relativeSeparation)
    routingThresholds.push(best.splitLinkThreshold)
    const children = best.clusterMemberIndices.map((childIndices) => recurse(childIndices, depth + 1))
    return { memberIndices, centroid, children, depth, splitLinkThreshold: best.splitLinkThreshold }
  }

  const root = recurse(allIndices, 0)

  const fellBackToStatic =
    acceptedRelativeSeparations.some((value) => !Number.isFinite(value)) ||
    routingThresholds.some((value) => !Number.isFinite(value))

  return {
    root,
    diagnostics: {
      selectedKByDepth,
      nodeCount,
      leafCount,
      maxDepth,
      acceptedSplits,
      rejectedCandidates,
      rejectionReasonCounts,
      acceptedRelativeSeparations,
      routingThresholds,
      fellBackToStatic,
      bestRootSeparation,
      escalated: false,
      escalationSkipped: false,
      projectedRootSearchWork: 0,
    },
  }
}

/**
 * A re-search is worth its cost only inside a band. Above the ceiling the root
 * split is comfortably clear of the gate and more search cannot change it. Below
 * the floor the corpus has no structure to find — a unimodal project's best root
 * candidate reaches ~0.09, and re-searching it burns the larger budget every run
 * to confirm the leaf it already had.
 *
 * The band is read off the ROOT, so the re-search spends its budget there and
 * nowhere else. The cost of this whole path has to fit the clustering worker's
 * deadline; see TAXONOMY_CLUSTERING_WORKER_TIMEOUT_MS.
 */
const shouldEscalate = (
  result: BuildRelativeHierarchicalClustersResult,
  escalation: RelativeClusteringEscalation,
): boolean => {
  const observed = result.diagnostics.bestRootSeparation
  return observed >= escalation.marginFloor && observed < escalation.marginThreshold
}

/**
 * The K the re-search is worth spending the larger budget on: the `width` best by
 * the score their first pass reached. A k-means run costs O(n·k·dimensions), so
 * re-sweeping all of 2..maxChildren multiplies the budget by the whole sweep to
 * re-confirm K values the first pass already ranked last. Ties break on the lower
 * K, which is both cheaper and the more conservative split.
 */
const promisingRootK = (scoreByK: ReadonlyMap<number, number>, width: number): ReadonlySet<number> =>
  new Set(
    [...scoreByK.entries()]
      .sort(([leftK, leftScore], [rightK, rightScore]) => rightScore - leftScore || leftK - rightK)
      .slice(0, width)
      .map(([k]) => k),
  )

/**
 * Upper bound on the dot-product element operations one root K sweep performs:
 * every (k, restart) pair runs at most `maxIter` k-means iterations, and each
 * iteration compares all members against k centroids across every dimension. An
 * upper bound because k-means usually converges before `maxIter`, so the budget
 * check errs toward declining a re-search rather than starting one that overruns.
 */
const projectedRootSweepWork = (input: {
  readonly memberCount: number
  readonly dimensions: number
  readonly restarts: number
  readonly maxIter: number
  readonly kSum: number
}): number => input.restarts * input.maxIter * input.memberCount * input.dimensions * input.kSum

/** The K a root sweep visits when nothing restricts it. */
const rootKRange = (memberCount: number, schedule: RelativeDepthSchedule): number[] => {
  const { maxK } = sweepBounds(memberCount, schedule)
  const ks: number[] = []
  for (let k = 2; k <= maxK; k++) ks.push(k)
  return ks
}

const sumOf = (values: Iterable<number>): number => {
  let total = 0
  for (const value of values) total += value
  return total
}

export const buildRelativeHierarchicalClusters = (
  input: BuildRelativeHierarchicalClustersInput,
): BuildRelativeHierarchicalClustersResult => {
  const rootScoreByK = new Map<number, number>()
  const first = buildRelativeOnce(input, undefined, (k, score) => {
    const previous = rootScoreByK.get(k)
    if (previous === undefined || score > previous) rootScoreByK.set(k, score)
  })
  const escalation = input.escalation
  if (!escalation || !shouldEscalate(first, escalation)) return first

  // Escalating implies a candidate cleared the score gate, so the map is populated;
  // an unrestricted sweep is the safe reading if it somehow is not.
  const restrictToK = promisingRootK(rootScoreByK, escalation.searchWidth)

  // Whether the re-search can afford to run, decided BEFORE any of it happens. The
  // first pass is charged too: both root sweeps land inside one worker invocation,
  // and it is their sum the deadline has to cover.
  const dimensions = input.embeddings[0]?.length ?? 0
  const memberCount = input.embeddings.reduce(
    (count, vector) => (vector && vector.length === dimensions ? count + 1 : count),
    0,
  )
  const rootSchedule = input.depthSchedule[0]
  const shared = { memberCount, dimensions, maxIter: input.maxIter }
  const projectedRootSearchWork = rootSchedule
    ? projectedRootSweepWork({
        ...shared,
        restarts: input.restarts,
        kSum: sumOf(rootKRange(memberCount, rootSchedule)),
      }) +
      projectedRootSweepWork({
        ...shared,
        restarts: escalation.restarts,
        kSum: sumOf(restrictToK.size > 0 ? restrictToK : rootKRange(memberCount, rootSchedule)),
      })
    : 0

  if (projectedRootSearchWork > escalation.maxSearchWork) {
    return {
      root: first.root,
      diagnostics: { ...first.diagnostics, escalationSkipped: true, projectedRootSearchWork },
    }
  }

  const rescued = buildRelativeOnce(input, {
    restarts: escalation.restarts,
    ...(restrictToK.size > 0 ? { restrictToK } : {}),
  })
  return {
    root: rescued.root,
    diagnostics: { ...rescued.diagnostics, escalated: true, projectedRootSearchWork },
  }
}

// ---------------------------------------------------------------------------
// Divisive builder — absolute sibling-cosine gate (static baseline).
//
// The current production path and the calibration-harness baseline; removed
// once the relative builder is the enforced default. Its k-means core is the
// shared primitive above; only the gate differs.
// ---------------------------------------------------------------------------

interface ChooseBestStaticKInput {
  readonly embeddings: readonly (readonly number[])[]
  readonly memberIndices: readonly number[]
  readonly schedule: StaticDepthSchedule
  readonly restarts: number
  readonly maxIter: number
  readonly tolerance: number
  readonly rng: () => number
}

interface StaticCandidate {
  readonly k: number
  readonly assignments: readonly number[]
  readonly centroids: readonly (readonly number[])[]
  readonly score: number
  readonly clusterMemberIndices: readonly (readonly number[])[]
}

const chooseBestStaticK = (input: ChooseBestStaticKInput): StaticCandidate | null => {
  const { embeddings, memberIndices, schedule, restarts, maxIter, tolerance, rng } = input
  const n = memberIndices.length
  const minByFraction = Math.ceil(n * schedule.minClusterFraction)
  const minClusterSize = Math.max(schedule.minClusterAbs, minByFraction)
  if (n < minClusterSize * 2) return null

  let best: StaticCandidate | null = null
  const maxK = Math.min(schedule.maxChildren, Math.floor(n / minClusterSize))
  for (let k = 2; k <= maxK; k++) {
    for (let restart = 0; restart < restarts; restart++) {
      const initial = kmeansPlusPlusInit(embeddings, memberIndices, k, rng)
      if (initial.length !== k) continue
      const { assignments, centroids } = sphericalKmeans({
        embeddings,
        memberIndices,
        initialCentroids: initial,
        maxIter,
        tolerance,
      })
      const clusterMemberIndices: number[][] = Array.from({ length: k }, () => [])
      for (let localIdx = 0; localIdx < n; localIdx++) {
        const cluster = assignments[localIdx] ?? 0
        const bucket = clusterMemberIndices[cluster]
        if (bucket) bucket.push(memberIndices[localIdx] ?? -1)
      }
      const undersized = clusterMemberIndices.some((bucket) => bucket.length < minClusterSize)
      if (undersized) continue
      let pairwiseTooClose = false
      for (let i = 0; i < k && !pairwiseTooClose; i++) {
        const left = centroids[i]
        if (!left) continue
        for (let j = i + 1; j < k && !pairwiseTooClose; j++) {
          const right = centroids[j]
          if (!right) continue
          if (cosineSimilarityNormalized(left, right) > schedule.maxSiblingCosine) pairwiseTooClose = true
        }
      }
      if (pairwiseTooClose) continue
      const score = calinskiHarabaszScore(embeddings, memberIndices, assignments, centroids)
      if (score < schedule.minSplitScore) continue
      if (!best || score > best.score) {
        best = { k, assignments, centroids, score, clusterMemberIndices }
      }
    }
  }
  return best
}

export const buildStaticHierarchicalClusters = (input: BuildStaticHierarchicalClustersInput): ClusteringTreeNode => {
  const { embeddings, depthSchedule, restarts, maxIter, tolerance, seed } = input
  const dimensions = embeddings[0]?.length ?? 0
  const allIndices = embeddings
    .map((vector, index) => (vector && vector.length === dimensions ? index : -1))
    .filter((index) => index >= 0)
  const rng = createRng(seed)

  const recurse = (memberIndices: readonly number[], depth: number): ClusteringTreeNode => {
    const centroid = meanOverIndices(embeddings, memberIndices, dimensions)
    const schedule = depthSchedule[depth]
    if (!schedule || memberIndices.length === 0) {
      return { memberIndices, centroid, children: [], depth }
    }
    const best = chooseBestStaticK({
      embeddings,
      memberIndices,
      schedule,
      restarts,
      maxIter,
      tolerance,
      rng,
    })
    if (!best) return { memberIndices, centroid, children: [], depth }
    const children = best.clusterMemberIndices.map((childIndices) => recurse(childIndices, depth + 1))
    return { memberIndices, centroid, children, depth }
  }

  return recurse(allIndices, 0)
}
