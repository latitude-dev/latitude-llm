/**
 * Static-vs-relative comparison harness — an offline tool, not a CI gate.
 *
 * Runs both SHIPPED builders over one shared fixture with identical k-means
 * constants and seed, then scores each tree with the same metric set. Use it to
 * try a schedule value: pass a schedule to `compareOnCorpus` / `crossSampleAri`
 * across the fixtures and read the numbers back. Nothing imports this from a
 * test — the assertions that matter live in `src/clustering.test.ts`.
 */

import {
  buildRelativeHierarchicalClusters,
  buildStaticHierarchicalClusters,
  type ClusteringTreeNode,
  type RelativeClusteringDiagnostics,
  type RelativeDepthSchedule,
  type StaticDepthSchedule,
} from "../clustering.ts"
import {
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
  TAXONOMY_TREE_STATIC_DEPTH_SCHEDULE,
} from "../constants.ts"
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

const STATIC_SCHEDULE: readonly StaticDepthSchedule[] = TAXONOMY_TREE_STATIC_DEPTH_SCHEDULE

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
  readonly adaptive: QualityScores & { readonly diagnostics: RelativeClusteringDiagnostics }
  /** ARI between the static and adaptive leaf partitions on the shared members. */
  readonly staticVsAdaptiveAri: number
}

const staticBuild = (corpus: LabeledCorpus): ClusteringTreeNode =>
  buildStaticHierarchicalClusters({
    embeddings: corpus.embeddings,
    depthSchedule: STATIC_SCHEDULE,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed: corpus.seed,
  })

export const adaptiveBuild = (
  corpus: LabeledCorpus,
  schedule: readonly RelativeDepthSchedule[] = TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
) =>
  buildRelativeHierarchicalClusters({
    embeddings: corpus.embeddings,
    depthSchedule: schedule,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed: corpus.seed,
    globalAbsoluteThreshold: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
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
  schedule: readonly RelativeDepthSchedule[] = TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
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
 * Cross-sample stability: how much the adaptive partition agrees with itself
 * across overlapping subsamples. Builds the ten leave-one-tenth-out folds once
 * and returns the MEAN adjusted Rand index over all 45 fold pairs (ARI is scored
 * on the members each pair shares). Averaging over every pair replaces the old
 * single-split estimate, which swung across ~[0, 0.9] purely by fold choice on a
 * cohesive real corpus. Deterministic — folds are by index residue, not random.
 */
export const crossSampleAri = (
  corpus: LabeledCorpus,
  schedule: readonly RelativeDepthSchedule[] = TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
): number => {
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

  const all = corpus.embeddings.map((_, index) => index)
  // One adaptive build per leave-one-tenth-out fold (drop residue r); reused
  // across every pair below so the mean costs 10 builds, not 45.
  const folds = Array.from({ length: 10 }, (_, r) => buildFor(all.filter((index) => index % 10 !== r)))

  const empty = new Map<number, string>()
  const aris: number[] = []
  for (let a = 0; a < folds.length; a++) {
    for (let b = a + 1; b < folds.length; b++) {
      // adjustedRandIndex scores the members the two folds share (residue ∉ {a, b}).
      aris.push(adjustedRandIndex(folds[a] ?? empty, folds[b] ?? empty))
    }
  }
  return aris.reduce((sum, value) => sum + value, 0) / aris.length
}
