/**
 * Direct tests of the relative divisive builder on the shipped
 * `TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE` — the Phase-2 exit criteria
 * (deterministic output, narrow-domain separation, unimodal suppression, finite
 * metrics, bounded diagnostics). The calibration harness (`src/calibration/`)
 * proves the schedule *values*; this file proves the shipped builder honours them
 * and matches the calibrated candidate byte-for-byte on the partition signature.
 */

import { describe, expect, it } from "vitest"
import {
  buildImbalancedLongTailCorpus,
  buildNarrowDomainCorpus,
  buildNearTiedLargeCorpus,
  buildRareIntentDuplicateCorpus,
  buildRetailSupportCorpus,
  buildTelecomSupportCorpus,
  buildUnimodalCorpus,
  type LabeledCorpus,
  loadNarrowPilotCorpus,
  resampleCorpus,
} from "./calibration/fixtures.ts"
import { partitionSignature, rootChildMajorityLabels, treeShape } from "./calibration/metrics.ts"
import { buildRelativeHierarchicalClusters, quantile } from "./clustering.ts"
import {
  TAXONOMY_ADAPTIVE_ROOT_SEARCH_MIN_SEPARATION,
  TAXONOMY_ADAPTIVE_ROOT_SEARCH_RESTARTS,
  TAXONOMY_ADAPTIVE_ROOT_SEARCH_WIDTH,
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
} from "./constants.ts"

// Multi-corpus k-means builds run 1-1.5s locally and ~3x that on CI hardware,
// which straddles Vitest's 5s default. Every heavy case gets an explicit budget.
const HEAVY_BUILD_TIMEOUT_MS = 60_000

const build = (corpus: LabeledCorpus) =>
  buildRelativeHierarchicalClusters({
    embeddings: corpus.embeddings,
    depthSchedule: TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed: corpus.seed,
    globalAbsoluteThreshold: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  })

const fixtures: readonly [string, LabeledCorpus][] = [
  ["retail", buildRetailSupportCorpus()],
  ["telecom", buildTelecomSupportCorpus()],
  ["narrow-domain", buildNarrowDomainCorpus()],
  ["narrow-pilot", loadNarrowPilotCorpus()],
  ["unimodal", buildUnimodalCorpus()],
]

describe("buildRelativeHierarchicalClusters — determinism", () => {
  it.each(fixtures)(
    "%s: identical partition signature + selected K across repeated builds",
    (_name, corpus) => {
      const first = build(corpus)
      const second = build(corpus)
      expect(partitionSignature(second.root)).toBe(partitionSignature(first.root))
      expect(second.diagnostics.selectedKByDepth).toEqual(first.diagnostics.selectedKByDepth)
    },
    HEAVY_BUILD_TIMEOUT_MS,
  )
})

// The committed schedule is `root + depth*0.1`; scheduleWithRoot(0.45) reproduces
// it and 0.60 is the stricter setting the real pilot ruled out.
const scheduleWithRoot = (root: number) =>
  TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE.map((depth, index) => ({
    ...depth,
    minRelativeSeparation: root + index * 0.1,
  }))

describe("buildRelativeHierarchicalClusters — the calibrated separation is load-bearing", () => {
  // Migrated from the retired calibration gate. The fixtures reproduce the real
  // pilot's geometry, so this pins the value rather than passing for any
  // threshold: raising the root back toward the synthetic-only ~0.60 that the
  // real corpus disproved collapses both trees and fails here. See
  // calibration/BASELINES.md for the measurement it encodes.
  it.each([
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
  ] as const)(
    "%s: resolves at the calibrated 0.45 gate and collapses at 0.60",
    (_name, corpus) => {
      const buildAt = (root: number) =>
        buildRelativeHierarchicalClusters({
          embeddings: corpus.embeddings,
          depthSchedule: scheduleWithRoot(root),
          restarts: TAXONOMY_KMEANS_RESTARTS,
          maxIter: TAXONOMY_KMEANS_MAX_ITER,
          tolerance: TAXONOMY_KMEANS_TOLERANCE,
          seed: corpus.seed,
          globalAbsoluteThreshold: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
        })
      const calibrated = buildAt(0.45)
      const tooStrict = buildAt(0.6)
      expect(calibrated.root.children.length).toBeGreaterThanOrEqual(3)
      expect(calibrated.root.children.length).toBeLessThanOrEqual(5)
      expect(tooStrict.root.children.length).toBeLessThan(3)
    },
    HEAVY_BUILD_TIMEOUT_MS,
  )
})

describe("buildRelativeHierarchicalClusters — narrow-domain separation", () => {
  it.each([
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
  ] as const)("%s: resolves 3–5 root children the fixed gate would collapse", (_name, corpus) => {
    const { root } = build(corpus)
    expect(root.children.length).toBeGreaterThanOrEqual(3)
    expect(root.children.length).toBeLessThanOrEqual(5)
  })
})

describe("buildRelativeHierarchicalClusters — shape guarantees", () => {
  it("keeps a unimodal corpus a single leaf", () => {
    const { root, diagnostics } = build(buildUnimodalCorpus())
    expect(root.children).toHaveLength(0)
    expect(diagnostics.acceptedSplits).toBe(0)
    expect(diagnostics.leafCount).toBe(1)
  })

  it.each([
    ["imbalanced-long-tail", buildImbalancedLongTailCorpus(), ["head-a", "head-b", "head-c"]],
    ["rare-intent-duplicate", buildRareIntentDuplicateCorpus(), ["common-a", "common-b", "duplicate"]],
  ] as const)("%s: sub-floor groups never become root children", (_name, corpus, allowedRootLabels) => {
    const { root } = build(corpus)
    for (const label of rootChildMajorityLabels(root, corpus.labels)) {
      expect(allowedRootLabels).toContain(label)
    }
  })
})

describe("buildRelativeHierarchicalClusters — bounded diagnostics", () => {
  it("never emits a non-finite metric on duplicate-vector data", () => {
    const { diagnostics } = build(buildRareIntentDuplicateCorpus())
    expect(diagnostics.fellBackToStatic).toBe(false)
    for (const value of diagnostics.acceptedRelativeSeparations) expect(Number.isFinite(value)).toBe(true)
    for (const value of diagnostics.routingThresholds) expect(Number.isFinite(value)).toBe(true)
  })

  it.each(fixtures)("%s: diagnostics are self-consistent and free of per-member data", (_name, corpus) => {
    const { root, diagnostics } = build(corpus)
    const shape = treeShape(root)
    expect(diagnostics.nodeCount).toBe(shape.nodeCount)
    expect(diagnostics.leafCount).toBe(shape.leafCount)
    // One separation + one routing threshold per accepted split, nothing per-member.
    expect(diagnostics.acceptedRelativeSeparations).toHaveLength(diagnostics.acceptedSplits)
    expect(diagnostics.routingThresholds).toHaveLength(diagnostics.acceptedSplits)
    const totalSelectedK = Object.values(diagnostics.selectedKByDepth).reduce((sum, ks) => sum + ks.length, 0)
    expect(totalSelectedK).toBe(diagnostics.acceptedSplits)
    for (const threshold of diagnostics.routingThresholds) {
      expect(threshold).toBeGreaterThanOrEqual(TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD)
      expect(threshold).toBeLessThanOrEqual(1)
    }
  })
})

// A re-searched build runs the root K sweep at the deep restart budget, ~8x a plain
// sweep, and the near-tied fixture is at the production sample cap.
const RE_SEARCH_TIMEOUT_MS = HEAVY_BUILD_TIMEOUT_MS

const rootSearch = {
  restarts: TAXONOMY_ADAPTIVE_ROOT_SEARCH_RESTARTS,
  searchWidth: TAXONOMY_ADAPTIVE_ROOT_SEARCH_WIDTH,
  minRootSeparation: TAXONOMY_ADAPTIVE_ROOT_SEARCH_MIN_SEPARATION,
}
const buildWith = (corpus: LabeledCorpus, withRootSearch: boolean) =>
  buildRelativeHierarchicalClusters({
    embeddings: corpus.embeddings,
    depthSchedule: TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
    restarts: TAXONOMY_KMEANS_RESTARTS,
    maxIter: TAXONOMY_KMEANS_MAX_ITER,
    tolerance: TAXONOMY_KMEANS_TOLERANCE,
    seed: corpus.seed,
    globalAbsoluteThreshold: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
    ...(withRootSearch ? { rootSearch } : {}),
  })

describe("buildRelativeHierarchicalClusters — deep root search", () => {
  it(
    "omitting the root-search config leaves the build byte-identical",
    () => {
      const corpus = buildNarrowDomainCorpus()
      expect(partitionSignature(buildWith(corpus, false).root)).toBe(partitionSignature(build(corpus).root))
      expect(buildWith(corpus, false).diagnostics.rootSearchKs).toBe(0)
    },
    RE_SEARCH_TIMEOUT_MS,
  )

  // The regression this file exists for. #4274 gated the re-search on a root
  // separation band, so it only ever fired on a root that nearly failed the
  // acceptance gate. Two production projects flickered with separations of 1.3 and
  // 3.7-42 — far above that band's ceiling — and so were never re-searched at all,
  // while the pilot's 0.41-0.67 sat inside it and stabilized. The band is gone: what
  // needs more search is a K DECISION taken over few restarts, which a separation
  // cannot report.
  it.each([
    ["retail", buildRetailSupportCorpus()],
    ["telecom", buildTelecomSupportCorpus()],
  ] as const)(
    "%s: a root far clear of the separation gate is re-searched anyway",
    (_name, corpus) => {
      const result = buildWith(corpus, true)
      expect(result.diagnostics.bestRootSeparation).toBeGreaterThan(1)
      expect(result.diagnostics.rootSearchKs).toBeGreaterThan(0)
    },
    RE_SEARCH_TIMEOUT_MS,
  )

  // The one thing still gating the search, and it is a floor: below it there is no
  // structure to find, so a unimodal project costs one plain build rather than the
  // deep budget every pass to reconfirm the leaf it already had.
  it("a corpus with no structure stays a leaf and is not re-searched", () => {
    const result = buildWith(buildUnimodalCorpus(), true)
    expect(result.diagnostics.bestRootSeparation).toBeLessThan(TAXONOMY_ADAPTIVE_ROOT_SEARCH_MIN_SEPARATION)
    expect(result.diagnostics.rootSearchKs).toBe(0)
    expect(result.root.children.length).toBe(0)
    expect(result.diagnostics.acceptedSplits).toBe(0)
  })

  it.each([
    ["narrow-domain", buildNarrowDomainCorpus()],
    ["narrow-pilot", loadNarrowPilotCorpus()],
  ] as const)(
    "%s: a near-gate root is re-searched and still resolves 3–5 children",
    (_name, corpus) => {
      const result = buildWith(corpus, true)
      expect(result.diagnostics.rootSearchKs).toBeGreaterThan(0)
      expect(result.root.children.length).toBeGreaterThanOrEqual(3)
      expect(result.root.children.length).toBeLessThanOrEqual(5)
    },
    RE_SEARCH_TIMEOUT_MS,
  )

  it(
    "the re-search is deterministic — repeated builds agree",
    () => {
      const corpus = buildNarrowDomainCorpus()
      const first = buildWith(corpus, true)
      const second = buildWith(corpus, true)
      expect(first.diagnostics.rootSearchKs).toBeGreaterThan(0)
      expect(partitionSignature(second.root)).toBe(partitionSignature(first.root))
    },
    RE_SEARCH_TIMEOUT_MS,
  )

  // Regression: the budget used to reach `restarts`, which every depth reads, so a
  // decision made on the ROOT re-searched the entire tree at ~10x the cost.
  // `rejectedCandidates` is a hardware-free proxy for search work — it undercounts
  // (accepted candidates and failed inits do not increment it) but is monotone in
  // work across two builds over the same corpus, which is all this compares.
  it(
    "the re-search spends the deep budget on the root only",
    () => {
      const corpus = buildNarrowDomainCorpus()
      const atRestarts = (restarts: number) =>
        buildRelativeHierarchicalClusters({
          embeddings: corpus.embeddings,
          depthSchedule: TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
          restarts,
          maxIter: TAXONOMY_KMEANS_MAX_ITER,
          tolerance: TAXONOMY_KMEANS_TOLERANCE,
          seed: corpus.seed,
          globalAbsoluteThreshold: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
        }).diagnostics.rejectedCandidates

      const rootOnly = buildWith(corpus, true)
      expect(rootOnly.diagnostics.rootSearchKs).toBeGreaterThan(0)

      const baseline = atRestarts(TAXONOMY_KMEANS_RESTARTS)
      const everyDepth = atRestarts(TAXONOMY_ADAPTIVE_ROOT_SEARCH_RESTARTS)
      const searched = rootOnly.diagnostics.rejectedCandidates

      // Strictly more search than baseline (the root did get the larger budget)
      // and strictly less than re-searching every depth at that budget.
      expect(searched).toBeGreaterThan(baseline)
      expect(searched).toBeLessThan(everyDepth)
      // Well under half, not merely under: the whole point is that the extra work
      // is one node's K sweep rather than the tree's.
      expect(searched).toBeLessThan(everyDepth / 2)
    },
    RE_SEARCH_TIMEOUT_MS,
  )

  // A k-means run costs O(n·k·dimensions), so re-sweeping all of 2..maxChildren
  // spends most of the deep budget re-confirming K the first pass already ranked
  // last, for the same root split.
  it(
    "the re-search sweeps only the best-scoring K, not the whole range",
    () => {
      const corpus = buildNarrowDomainCorpus()
      const widthOf = (searchWidth: number) =>
        buildRelativeHierarchicalClusters({
          embeddings: corpus.embeddings,
          depthSchedule: TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
          restarts: TAXONOMY_KMEANS_RESTARTS,
          maxIter: TAXONOMY_KMEANS_MAX_ITER,
          tolerance: TAXONOMY_KMEANS_TOLERANCE,
          seed: corpus.seed,
          globalAbsoluteThreshold: TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
          rootSearch: { ...rootSearch, searchWidth },
        })

      const narrow = widthOf(TAXONOMY_ADAPTIVE_ROOT_SEARCH_WIDTH)
      const wide = widthOf(TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE[0]?.maxChildren ?? 10)
      expect(narrow.diagnostics.rootSearchKs).toBeLessThan(wide.diagnostics.rootSearchKs)

      // The narrowed sweep does strictly less work...
      expect(narrow.diagnostics.rejectedCandidates).toBeLessThan(wide.diagnostics.rejectedCandidates)
      // ...and still reaches the same root split, which is what makes it free.
      expect(narrow.root.children.length).toBe(wide.root.children.length)
    },
    RE_SEARCH_TIMEOUT_MS,
  )
})

// The near-gate flicker on a LARGE project (LAT-773; PR #4274 introduced the band,
// #4334 the work budget). `near-tied-large` sits at the production sample cap with an
// obvious root split whose winning K is not: the highest-SCORING root candidate is not
// the one the gates accept. Such a corpus used to get no re-search on two counts — its
// root separation sat above the band's ceiling, and re-searching ~1.5k members was
// declined as unaffordable — which is why the two production projects that flickered
// worst never once received the stabilization the pilot did.
describe("buildRelativeHierarchicalClusters — large near-tied root", () => {
  const corpus = buildNearTiedLargeCorpus()

  it(
    "a comfortable root at the sample cap is re-searched, where band and budget skipped it",
    () => {
      expect(corpus.embeddings.length).toBeGreaterThanOrEqual(TAXONOMY_CLUSTERING_PROPOSAL_SAMPLE_MAX)
      const result = buildWith(corpus, true)
      expect(result.diagnostics.rootSearchKs).toBeGreaterThan(0)
      // Far above the retired 0.8 ceiling: nothing about a comfortable separation says
      // the K decision under it is settled.
      expect(result.diagnostics.bestRootSeparation).toBeGreaterThan(TAXONOMY_ADAPTIVE_ROOT_SEARCH_MIN_SEPARATION)
    },
    RE_SEARCH_TIMEOUT_MS,
  )

  // The re-search sweeps the K the first pass ACCEPTED plus the best-scoring others.
  // Ranking by score alone does not include it — the scores cover every candidate that
  // got as far as being scored, including ones the separation gate then rejected — so a
  // re-search restricted to the top scorers can return a worse root than the pass it
  // was meant to improve. On this corpus it returned 4 children where the plain sweep
  // accepted 5.
  it.each([0, 1, 2])(
    "pass %i: the re-search keeps the root cut the plain sweep accepted or improves on it",
    (pass) => {
      const sample = resampleCorpus(corpus, pass)
      const plain = buildWith(sample, false)
      const searched = buildWith(sample, true)
      expect(searched.root.children.length).toBe(plain.root.children.length)
      expect(searched.diagnostics.selectedKByDepth[0]).toEqual(plain.diagnostics.selectedKByDepth[0])
    },
    RE_SEARCH_TIMEOUT_MS * 2,
  )
})

describe("quantile — linear interpolation at (n-1)·q", () => {
  it("interpolates between the two flanking order statistics", () => {
    expect(quantile([0, 1, 2, 3], 0.5)).toBe(1.5)
    expect(quantile([10, 20, 30], 0)).toBe(10)
    expect(quantile([10, 20, 30], 1)).toBe(30)
    // (n-1)*0.8 = 1.6 → 20 + 0.6*(30-20) = 26.
    expect(quantile([10, 20, 30], 0.8)).toBeCloseTo(26, 10)
  })

  it("is order-independent and defined on degenerate inputs", () => {
    expect(quantile([3, 0, 2, 1], 0.5)).toBe(1.5)
    expect(quantile([], 0.5)).toBe(0)
    expect(quantile([7], 0.9)).toBe(7)
  })
})
