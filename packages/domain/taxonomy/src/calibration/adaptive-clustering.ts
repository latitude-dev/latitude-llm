/**
 * Adaptive divisive builder — Phase-1 calibration reference.
 *
 * This is NOT production code. It is the candidate adaptive algorithm from
 * `specs/taxonomy-adaptive-clustering.md` ("Adaptive split algorithm"),
 * implemented here so Phase 1 can calibrate its schedule values and rollout
 * limits against the static baseline BEFORE any builder in `clustering.ts`
 * changes. Phase 2 folds this gate back into the production builder; nothing
 * outside `src/calibration/` imports this file.
 *
 * The k-means primitives below are a verbatim fork of `clustering.ts` so the
 * only difference between the static and adaptive trees on a shared fixture is
 * the split-acceptance gate: static rejects on absolute sibling cosine, adaptive
 * rejects on node-relative separation plus dominant-child protection. Keeping
 * the primitives identical (same seed, same k-means++, same CH score) makes the
 * comparison a clean A/B on the gate alone.
 */

import { normalizeEmbedding } from "@domain/shared"
import { cosineSimilarityNormalized } from "../helpers.ts"

export interface AdaptiveDepthSchedule {
  readonly maxChildren: number
  readonly minClusterFraction: number
  readonly minClusterAbs: number
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

export interface AdaptiveTreeNode {
  readonly memberIndices: readonly number[]
  readonly centroid: readonly number[]
  readonly children: readonly AdaptiveTreeNode[]
  readonly depth: number
  /**
   * Lower-bound cosine similarity required to descend from this node to a chosen
   * child. Null for leaves. Derived from per-child member routing confidence.
   */
  readonly splitLinkThreshold: number | null
}

export type AdaptiveRejectionReason = "undersizedChild" | "dominantChild" | "lowScore" | "lowRelativeSeparation"

export interface AdaptiveDiagnostics {
  /** Selected K per accepted split, keyed by depth (depth → [K, ...]). */
  readonly selectedKByDepth: Record<number, number[]>
  readonly nodeCount: number
  readonly leafCount: number
  readonly maxDepth: number
  readonly acceptedSplits: number
  readonly rejectedCandidates: number
  readonly rejectionReasonCounts: Record<AdaptiveRejectionReason, number>
  /** Relative separation of every accepted split — for percentile summaries. */
  readonly acceptedRelativeSeparations: number[]
  /** splitLinkThreshold of every accepted split. */
  readonly routingThresholds: number[]
  /** True when a structural or non-finite guardrail fired (fallback trigger for later phases). */
  readonly fellBackToStatic: boolean
}

export interface BuildAdaptiveClustersInput {
  readonly embeddings: readonly (readonly number[])[]
  readonly depthSchedule: readonly AdaptiveDepthSchedule[]
  readonly restarts: number
  readonly maxIter: number
  readonly tolerance: number
  readonly seed: number
  /** Global absolute floor on the routing threshold (mirrors TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD). */
  readonly globalAbsoluteThreshold: number
}

export interface BuildAdaptiveClustersResult {
  readonly root: AdaptiveTreeNode
  readonly diagnostics: AdaptiveDiagnostics
}

// ---------------------------------------------------------------------------
// Forked pure primitives (verbatim from clustering.ts).
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

interface KmeansResult {
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
// Adaptive metric helpers (spec "Adaptive split algorithm").
// ---------------------------------------------------------------------------

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

interface AdaptiveCandidate {
  readonly k: number
  readonly assignments: readonly number[]
  readonly centroids: readonly (readonly number[])[]
  readonly score: number
  readonly relativeSeparation: number
  readonly splitLinkThreshold: number
  readonly clusterMemberIndices: readonly (readonly number[])[]
}

interface ChooseBestAdaptiveKInput {
  readonly embeddings: readonly (readonly number[])[]
  readonly memberIndices: readonly number[]
  readonly schedule: AdaptiveDepthSchedule
  readonly restarts: number
  readonly maxIter: number
  readonly tolerance: number
  readonly globalAbsoluteThreshold: number
  readonly rng: () => number
  readonly onReject: (reason: AdaptiveRejectionReason) => void
}

const chooseBestAdaptiveK = (input: ChooseBestAdaptiveKInput): AdaptiveCandidate | null => {
  const { embeddings, memberIndices, schedule, restarts, maxIter, tolerance, globalAbsoluteThreshold, rng, onReject } =
    input
  const n = memberIndices.length
  const minByFraction = Math.ceil(n * schedule.minClusterFraction)
  const minClusterSize = Math.max(schedule.minClusterAbs, minByFraction)
  if (n < minClusterSize * 2) return null

  let best: AdaptiveCandidate | null = null
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
        clusterMemberIndices[cluster]?.push(memberIndices[localIdx] ?? -1)
      }

      let smallestChildSize = Number.POSITIVE_INFINITY
      let largestChildSize = 0
      for (const bucket of clusterMemberIndices) {
        if (bucket.length < smallestChildSize) smallestChildSize = bucket.length
        if (bucket.length > largestChildSize) largestChildSize = bucket.length
      }
      if (smallestChildSize < minClusterSize) {
        onReject("undersizedChild")
        continue
      }

      const dominantChildFraction = largestChildSize / n
      if (dominantChildFraction > schedule.maxDominantChildFraction) {
        onReject("dominantChild")
        continue
      }

      const score = calinskiHarabaszScore(embeddings, memberIndices, assignments, centroids)
      if (score < schedule.minSplitScore) {
        onReject("lowScore")
        continue
      }

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
      if (relativeSeparation < schedule.minRelativeSeparation) {
        onReject("lowRelativeSeparation")
        continue
      }

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

export const buildAdaptiveClusters = (input: BuildAdaptiveClustersInput): BuildAdaptiveClustersResult => {
  const { embeddings, depthSchedule, restarts, maxIter, tolerance, seed, globalAbsoluteThreshold } = input
  const dimensions = embeddings[0]?.length ?? 0
  const allIndices = embeddings
    .map((vector, index) => (vector && vector.length === dimensions ? index : -1))
    .filter((index) => index >= 0)
  const rng = createRng(seed)

  const selectedKByDepth: Record<number, number[]> = {}
  const rejectionReasonCounts: Record<AdaptiveRejectionReason, number> = {
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

  const recurse = (memberIndices: readonly number[], depth: number): AdaptiveTreeNode => {
    nodeCount++
    if (depth > maxDepth) maxDepth = depth
    const centroid = meanOverIndices(embeddings, memberIndices, dimensions)
    const schedule = depthSchedule[depth]
    if (!schedule || memberIndices.length === 0) {
      leafCount++
      return { memberIndices, centroid, children: [], depth, splitLinkThreshold: null }
    }
    const best = chooseBestAdaptiveK({
      embeddings,
      memberIndices,
      schedule,
      restarts,
      maxIter,
      tolerance,
      globalAbsoluteThreshold,
      rng,
      onReject: (reason) => {
        rejectedCandidates++
        rejectionReasonCounts[reason]++
      },
    })
    if (!best) {
      leafCount++
      return { memberIndices, centroid, children: [], depth, splitLinkThreshold: null }
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
    },
  }
}
