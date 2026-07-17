/**
 * Phase-1 exit-criteria gate for adaptive taxonomy clustering (LAT-770).
 *
 * This test IS the acceptance evidence: it runs the calibration harness over the
 * shared fixtures and asserts every exit criterion in
 * `specs/taxonomy-adaptive-clustering.md` → "Evaluation" against the calibrated
 * schedule in `schedule.ts`. The recorded numeric values live in `BASELINES.md`;
 * this test is what keeps them true. No production code path is exercised beyond
 * the static `buildHierarchicalClusters` baseline it regresses against.
 */

import { EMBEDDING_DIMENSIONS } from "@domain/ai"
import { normalizeEmbedding } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { buildHierarchicalClusters } from "../clustering.ts"
import {
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_TREE_DEPTH_SCHEDULE,
} from "../constants.ts"
import { cosineSimilarity } from "../helpers.ts"
import { buildAdaptiveClusters } from "./adaptive-clustering.ts"
import {
  buildAirlineSupportCorpus,
  buildImbalancedLongTailCorpus,
  buildNarrowDomainCorpus,
  buildRareIntentDuplicateCorpus,
  buildRetailSupportCorpus,
  buildTelecomSupportCorpus,
  buildUnimodalCorpus,
  type LabeledCorpus,
  loadNarrowPilotCorpus,
} from "./fixtures.ts"
import { adaptiveBuild, compareOnCorpus, crossSampleAri } from "./harness.ts"
import { partitionSignature, rootChildMajorityLabels, treeShape } from "./metrics.ts"
import {
  ADAPTIVE_BROAD_REGRESSION_TOLERANCE,
  ADAPTIVE_CROSS_SAMPLE_ARI_FLOOR,
  ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD,
  ADAPTIVE_GROUP_RECALL_FLOOR,
  ADAPTIVE_LABELED_PURITY_FLOOR,
  ADAPTIVE_ROLLOUT_LIMITS,
  ADAPTIVE_RUNTIME_RATIO_CEILING,
  ADAPTIVE_TREE_DEPTH_SCHEDULE,
  ADAPTIVE_WORKER_MAX_OLD_GEN_MB,
} from "./schedule.ts"

const centroidOfLabel = (corpus: LabeledCorpus, label: string): number[] => {
  const sum = new Array<number>(corpus.dimensions).fill(0)
  corpus.embeddings.forEach((vector, index) => {
    if (corpus.labels[index] !== label) return
    for (let d = 0; d < corpus.dimensions; d++) sum[d] = (sum[d] ?? 0) + (vector[d] ?? 0)
  })
  return normalizeEmbedding(sum)
}

const siblingCentroidCosines = (corpus: LabeledCorpus): number[] => {
  const labels = [...new Set(corpus.labels)]
  const centroids = labels.map((label) => centroidOfLabel(corpus, label))
  const cosines: number[] = []
  for (let i = 0; i < centroids.length; i++) {
    for (let j = i + 1; j < centroids.length; j++) {
      const left = centroids[i]
      const right = centroids[j]
      if (left && right) cosines.push(cosineSimilarity(left, right))
    }
  }
  return cosines
}

// The committed schedule is `root + depth*0.1`; scheduleWithRoot(0.45) reproduces
// it, scheduleWithRoot(0.60) is the stricter setting the real pilot ruled out.
const scheduleWithRoot = (root: number) =>
  ADAPTIVE_TREE_DEPTH_SCHEDULE.map((depth, index) => ({ ...depth, minRelativeSeparation: root + index * 0.1 }))

describe("adaptive clustering — the calibrated separation is load-bearing", () => {
  // Fixtures are tuned to the real pilot's messy geometry, so this pins the
  // value: the committed 0.45 resolves them, and a synthetic-only ~0.60 (which
  // the real pilot disproved) collapses them. Raising the committed schedule
  // toward 0.60 would break the narrow-domain resolution test above.
  it.each([
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["pilot", loadNarrowPilotCorpus()],
  ] as const)("%s: resolves at the calibrated 0.45 gate and collapses at 0.60", (_name, corpus) => {
    const calibrated = adaptiveBuild(corpus, scheduleWithRoot(0.45))
    const tooStrict = adaptiveBuild(corpus, scheduleWithRoot(0.6))
    expect(calibrated.root.children.length).toBeGreaterThanOrEqual(3)
    expect(calibrated.root.children.length).toBeLessThanOrEqual(5)
    expect(tooStrict.root.children.length).toBeLessThan(3)
  })
})

describe("adaptive clustering — narrow-domain resolution", () => {
  it.each([
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
  ] as const)("%s: closest sibling centroids sit above 0.85 (the fixed-gate collapse zone)", (_name, corpus) => {
    // The static `maxSiblingCosine` (0.85) rejects a split when its *closest*
    // sibling pair is above the ceiling, so the closest pair (max cosine) is the
    // quantity that makes the fixed gate collapse the tree. Not every pair needs
    // to exceed it — the real pilot's pairs ran 0.84–0.89.
    const cosines = siblingCentroidCosines(corpus)
    expect(Math.max(...cosines)).toBeGreaterThan(0.85)
  })

  it.each([
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
  ] as const)("%s: static collapses to a single node, adaptive resolves 3–5 root children", (_name, corpus) => {
    const comparison = compareOnCorpus(corpus)
    // Static's absolute sibling-cosine gate rejects every split → a bare leaf.
    expect(comparison.static.shape.rootChildCount).toBe(0)
    expect(comparison.adaptive.shape.rootChildCount).toBeGreaterThanOrEqual(3)
    expect(comparison.adaptive.shape.rootChildCount).toBeLessThanOrEqual(5)
  })

  it.each([
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
  ] as const)("%s: mean purity ≥ 0.85 and every intended group has ≥ 0.85 recall in one child", (_name, corpus) => {
    const { adaptive } = compareOnCorpus(corpus)
    expect(adaptive.leafPurity).toBeGreaterThanOrEqual(ADAPTIVE_LABELED_PURITY_FLOOR)
    for (const recall of Object.values(adaptive.perGroupRecallRootChild)) {
      expect(recall).toBeGreaterThanOrEqual(ADAPTIVE_GROUP_RECALL_FLOOR)
    }
  })
})

describe("adaptive clustering — shape guarantees", () => {
  it("keeps a unimodal corpus a single leaf (no defensible split)", () => {
    const { adaptive } = compareOnCorpus(buildUnimodalCorpus())
    expect(adaptive.shape.rootChildCount).toBe(0)
    expect(adaptive.shape.leafCount).toBe(1)
    expect(adaptive.diagnostics.acceptedSplits).toBe(0)
  })

  it.each([
    ["imbalanced-long-tail", buildImbalancedLongTailCorpus(), ["head-a", "head-b", "head-c"]],
    ["rare-intent-duplicate", buildRareIntentDuplicateCorpus(), ["common-a", "common-b", "duplicate"]],
  ] as const)("%s: sub-floor groups never become root children", (_name, corpus, allowedRootLabels) => {
    const { root } = adaptiveBuild(corpus)
    const majorityLabels = rootChildMajorityLabels(root, corpus.labels)
    for (const label of majorityLabels) {
      expect(allowedRootLabels).toContain(label)
    }
  })

  it("never emits a non-finite adaptive metric (duplicate-vector safety, 1e-6 within-distance floor)", () => {
    const { diagnostics } = adaptiveBuild(buildRareIntentDuplicateCorpus())
    expect(diagnostics.fellBackToStatic).toBe(false)
    for (const separation of diagnostics.acceptedRelativeSeparations) expect(Number.isFinite(separation)).toBe(true)
    for (const threshold of diagnostics.routingThresholds) expect(Number.isFinite(threshold)).toBe(true)
  })
})

describe("adaptive clustering — routing thresholds", () => {
  it.each([
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
    ["retail", buildRetailSupportCorpus()],
  ] as const)("%s: every routing threshold is finite and at least the global absolute floor", (_name, corpus) => {
    const { diagnostics } = adaptiveBuild(corpus)
    expect(diagnostics.routingThresholds.length).toBeGreaterThan(0)
    for (const threshold of diagnostics.routingThresholds) {
      expect(threshold).toBeGreaterThanOrEqual(ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD)
      expect(threshold).toBeLessThanOrEqual(1)
    }
  })
})

describe("adaptive clustering — determinism", () => {
  const fixtures: readonly [string, LabeledCorpus][] = [
    ["retail", buildRetailSupportCorpus()],
    ["telecom", buildTelecomSupportCorpus()],
    ["airline", buildAirlineSupportCorpus()],
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
    ["unimodal", buildUnimodalCorpus()],
  ]

  it.each(fixtures)("%s: identical partition signature across repeated builds", (_name, corpus) => {
    const first = buildAdaptiveClusters({
      embeddings: corpus.embeddings,
      depthSchedule: ADAPTIVE_TREE_DEPTH_SCHEDULE,
      restarts: TAXONOMY_KMEANS_RESTARTS,
      maxIter: TAXONOMY_KMEANS_MAX_ITER,
      tolerance: TAXONOMY_KMEANS_TOLERANCE,
      seed: corpus.seed,
      globalAbsoluteThreshold: ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD,
    })
    const second = buildAdaptiveClusters({
      embeddings: corpus.embeddings,
      depthSchedule: ADAPTIVE_TREE_DEPTH_SCHEDULE,
      restarts: TAXONOMY_KMEANS_RESTARTS,
      maxIter: TAXONOMY_KMEANS_MAX_ITER,
      tolerance: TAXONOMY_KMEANS_TOLERANCE,
      seed: corpus.seed,
      globalAbsoluteThreshold: ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD,
    })
    expect(partitionSignature(second.root)).toBe(partitionSignature(first.root))
    expect(second.diagnostics.selectedKByDepth).toEqual(first.diagnostics.selectedKByDepth)
  })
})

describe("adaptive clustering — broad-domain regression + cross-sample stability", () => {
  const broadFixtures: readonly [string, LabeledCorpus][] = [
    ["retail", buildRetailSupportCorpus()],
    ["telecom", buildTelecomSupportCorpus()],
    ["airline", buildAirlineSupportCorpus()],
  ]

  it.each(broadFixtures)("%s: adaptive leaf purity stays within regression tolerance of static", (_name, corpus) => {
    const comparison = compareOnCorpus(corpus)
    expect(comparison.static.leafPurity - comparison.adaptive.leafPurity).toBeLessThanOrEqual(
      ADAPTIVE_BROAD_REGRESSION_TOLERANCE,
    )
    // On well-separated broad corpora the two builders should agree almost exactly.
    expect(comparison.staticVsAdaptiveAri).toBeGreaterThanOrEqual(ADAPTIVE_CROSS_SAMPLE_ARI_FLOOR)
  })

  it.each([
    ["retail", buildRetailSupportCorpus()],
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
    ["imbalanced-long-tail", buildImbalancedLongTailCorpus()],
  ] as const)("%s: cross-sample partition stability is above the ARI floor", (_name, corpus) => {
    expect(crossSampleAri(corpus)).toBeGreaterThanOrEqual(ADAPTIVE_CROSS_SAMPLE_ARI_FLOOR)
  })
})

describe("adaptive clustering — resource bounds at the 1,500-sample cap", () => {
  const makeBenchmarkCorpus = (): readonly (readonly number[])[] => {
    let state = 0xbeef >>> 0
    const rng = () => {
      state = (state + 0x6d2b79f5) >>> 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const gaussian = () => Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-12))) * Math.cos(2 * Math.PI * rng())
    const dims = EMBEDDING_DIMENSIONS
    const groups = 8
    const centroids = Array.from({ length: groups }, () => normalizeEmbedding(Array.from({ length: dims }, gaussian)))
    const embeddings: number[][] = []
    for (let i = 0; i < TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX; i++) {
      const centroid = centroids[i % groups] ?? []
      const vector = new Array<number>(dims)
      for (let d = 0; d < dims; d++) vector[d] = (centroid[d] ?? 0) + 0.05 * gaussian()
      embeddings.push(normalizeEmbedding(vector))
    }
    return embeddings
  }

  it("adaptive is no more than 25% slower than static and stays within the node cap", () => {
    const embeddings = makeBenchmarkCorpus()

    const staticStart = performance.now()
    buildHierarchicalClusters({
      embeddings,
      depthSchedule: TAXONOMY_TREE_DEPTH_SCHEDULE,
      restarts: TAXONOMY_KMEANS_RESTARTS,
      maxIter: TAXONOMY_KMEANS_MAX_ITER,
      tolerance: TAXONOMY_KMEANS_TOLERANCE,
      seed: 42,
    })
    const staticMs = performance.now() - staticStart

    const rssBeforeAdaptive = process.memoryUsage().rss
    const adaptiveStart = performance.now()
    const { root, diagnostics } = buildAdaptiveClusters({
      embeddings,
      depthSchedule: ADAPTIVE_TREE_DEPTH_SCHEDULE,
      restarts: TAXONOMY_KMEANS_RESTARTS,
      maxIter: TAXONOMY_KMEANS_MAX_ITER,
      tolerance: TAXONOMY_KMEANS_TOLERANCE,
      seed: 42,
      globalAbsoluteThreshold: ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD,
    })
    const adaptiveMs = performance.now() - adaptiveStart
    const adaptiveRssGrowthBytes = process.memoryUsage().rss - rssBeforeAdaptive

    expect(treeShape(root).nodeCount).toBeLessThanOrEqual(ADAPTIVE_ROLLOUT_LIMITS.nodeCap)
    expect(diagnostics.fellBackToStatic).toBe(false)
    // Ratio is measured back-to-back on the same machine; the extra adaptive work
    // (O(n) member distances + O(K²) sibling distances per candidate) is dominated
    // by shared k-means, so the ratio hovers around 1.0.
    expect(adaptiveMs / staticMs).toBeLessThanOrEqual(ADAPTIVE_RUNTIME_RATIO_CEILING)
    // Memory gate: assert the *build's own* RSS growth (isolated from the node/vitest
    // baseline, which absolute process RSS can't be) stays within the worker old-gen
    // budget. The build is O(n·dims); this is a coarse tripwire for a gross
    // (e.g. O(n²·dims)) allocation regression, with large headroom over the ~tens of MB
    // a healthy 1,500×2,048 build actually adds.
    expect(adaptiveRssGrowthBytes).toBeLessThanOrEqual(ADAPTIVE_WORKER_MAX_OLD_GEN_MB * 1024 * 1024)
  }, 120_000)
})
