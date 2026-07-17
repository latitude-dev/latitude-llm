/**
 * Static-vs-adaptive comparison harness. Runs both builders over one shared
 * fixture with identical k-means constants and seed, then scores each tree with
 * the same metric set. This is the calibration surface: pick schedule values,
 * run `compareOnCorpus` across the fixtures, and read the numbers back.
 */

import { buildHierarchicalClusters, type ClusteringTreeNode, type DepthSchedule } from "../clustering.ts"
import {
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_TREE_DEPTH_SCHEDULE,
} from "../constants.ts"
import { type AdaptiveDepthSchedule, type AdaptiveDiagnostics, buildAdaptiveClusters } from "./adaptive-clustering.ts"
import type { LabeledCorpus } from "./fixtures.ts"
import {
  adjustedRandIndex,
  type ClusterNodeLike,
  leafAssignment,
  perLabelRecall,
  purity,
  rootChildAssignment,
  type TreeShape,
  treeShape,
} from "./metrics.ts"
import { ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD, ADAPTIVE_TREE_DEPTH_SCHEDULE } from "./schedule.ts"

const STATIC_SCHEDULE: readonly DepthSchedule[] = TAXONOMY_TREE_DEPTH_SCHEDULE

export interface QualityScores {
  readonly shape: TreeShape
  /** Weighted purity over the deepest-leaf partition. */
  readonly leafPurity: number
  /** Weighted purity over the root-children partition. */
  readonly rootChildPurity: number
  /** Per-label best-single-cluster recall over the root-children partition. */
  readonly perGroupRecallRootChild: Record<string, number>
  /** Minimum per-group recall over the root-children partition. */
  readonly minGroupRecallRootChild: number
}

export interface CorpusComparison {
  readonly corpus: string
  readonly memberCount: number
  readonly groupCount: number
  readonly static: QualityScores
  readonly adaptive: QualityScores & { readonly diagnostics: AdaptiveDiagnostics }
  /** ARI between the static and adaptive leaf partitions on the shared members. */
  readonly staticVsAdaptiveAri: number
}

const staticBuild = (corpus: LabeledCorpus): ClusteringTreeNode =>
  buildHierarchicalClusters({
    embeddings: corpus.embeddings,
    depthSchedule: STATIC_SCHEDULE,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed: corpus.seed,
  })

export const adaptiveBuild = (
  corpus: LabeledCorpus,
  schedule: readonly AdaptiveDepthSchedule[] = ADAPTIVE_TREE_DEPTH_SCHEDULE,
) =>
  buildAdaptiveClusters({
    embeddings: corpus.embeddings,
    depthSchedule: schedule,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed: corpus.seed,
    globalAbsoluteThreshold: ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD,
  })

const scoreTree = (root: ClusterNodeLike, labels: readonly string[]): QualityScores => {
  const shape = treeShape(root)
  const leaves = leafAssignment(root)
  const rootChildren = rootChildAssignment(root)
  const rootChildAsStrings = new Map<number, string>()
  for (const [memberIndex, childIndex] of rootChildren) rootChildAsStrings.set(memberIndex, String(childIndex))
  const recall = perLabelRecall(rootChildAsStrings, labels)
  const perGroupRecallRootChild: Record<string, number> = {}
  let minGroupRecall = Number.POSITIVE_INFINITY
  for (const [label, value] of recall) {
    perGroupRecallRootChild[label] = value
    if (value < minGroupRecall) minGroupRecall = value
  }
  return {
    shape,
    leafPurity: purity(leaves, labels),
    rootChildPurity: rootChildren.size === 0 ? 0 : purity(rootChildAsStrings, labels),
    perGroupRecallRootChild,
    minGroupRecallRootChild: Number.isFinite(minGroupRecall) ? minGroupRecall : 0,
  }
}

export const compareOnCorpus = (
  corpus: LabeledCorpus,
  schedule: readonly AdaptiveDepthSchedule[] = ADAPTIVE_TREE_DEPTH_SCHEDULE,
): CorpusComparison => {
  const staticTree = staticBuild(corpus)
  const { root: adaptiveTree, diagnostics } = adaptiveBuild(corpus, schedule)
  const groupCount = new Set(corpus.labels).size
  return {
    corpus: corpus.name,
    memberCount: corpus.embeddings.length,
    groupCount,
    static: scoreTree(staticTree, corpus.labels),
    adaptive: { ...scoreTree(adaptiveTree, corpus.labels), diagnostics },
    staticVsAdaptiveAri: adjustedRandIndex(leafAssignment(staticTree), leafAssignment(adaptiveTree)),
  }
}

/**
 * Cross-sample stability: draw two overlapping subsamples of a corpus, adaptively
 * cluster each, and return the ARI on the members shared by both subsamples.
 * Deterministic — the split is by index residue, not random.
 */
export const crossSampleAri = (
  corpus: LabeledCorpus,
  schedule: readonly AdaptiveDepthSchedule[] = ADAPTIVE_TREE_DEPTH_SCHEDULE,
): number => {
  const indicesA: number[] = []
  const indicesB: number[] = []
  corpus.embeddings.forEach((_, index) => {
    if (index % 10 !== 0) indicesA.push(index) // drops residue 0 (90%)
    if (index % 10 !== 5) indicesB.push(index) // drops residue 5 (90%)
  })

  const subsample = (indices: readonly number[]): LabeledCorpus => ({
    ...corpus,
    embeddings: indices.map((index) => corpus.embeddings[index] ?? []),
    labels: indices.map((index) => corpus.labels[index] ?? "?"),
  })

  const buildFor = (indices: readonly number[]): Map<number, string> => {
    const { root } = adaptiveBuild(subsample(indices), schedule)
    const local = leafAssignment(root)
    const global = new Map<number, string>()
    for (const [localIndex, clusterId] of local) {
      const globalIndex = indices[localIndex]
      if (globalIndex !== undefined) global.set(globalIndex, clusterId)
    }
    return global
  }

  return adjustedRandIndex(buildFor(indicesA), buildFor(indicesB))
}
