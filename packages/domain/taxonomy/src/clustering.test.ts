/**
 * Direct tests of the relative divisive builder on the shipped
 * `TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE` — the Phase-2 exit criteria
 * (deterministic output, narrow-domain separation, unimodal suppression, finite
 * metrics, bounded diagnostics). The calibration harness (`src/calibration/`)
 * proves the schedule *values*; this file proves the shipped builder honours them
 * and matches the calibrated candidate byte-for-byte on the partition signature.
 */

import { describe, expect, it } from "vitest"
import { buildAdaptiveClusters } from "./calibration/adaptive-clustering.ts"
import {
  buildImbalancedLongTailCorpus,
  buildNarrowDomainCorpus,
  buildRareIntentDuplicateCorpus,
  buildRetailSupportCorpus,
  buildTelecomSupportCorpus,
  buildUnimodalCorpus,
  type LabeledCorpus,
  loadNarrowPilotCorpus,
} from "./calibration/fixtures.ts"
import { partitionSignature, rootChildMajorityLabels, treeShape } from "./calibration/metrics.ts"
import { ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD, ADAPTIVE_TREE_DEPTH_SCHEDULE } from "./calibration/schedule.ts"
import { buildRelativeHierarchicalClusters, quantile } from "./clustering.ts"
import {
  TAXONOMY_ASSIGN_ABSOLUTE_THRESHOLD,
  TAXONOMY_KMEANS_MAX_ITER,
  TAXONOMY_KMEANS_RESTARTS,
  TAXONOMY_KMEANS_TOLERANCE,
  TAXONOMY_TREE_RELATIVE_DEPTH_SCHEDULE,
} from "./constants.ts"

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
  it.each(fixtures)("%s: identical partition signature + selected K across repeated builds", (_name, corpus) => {
    const first = build(corpus)
    const second = build(corpus)
    expect(partitionSignature(second.root)).toBe(partitionSignature(first.root))
    expect(second.diagnostics.selectedKByDepth).toEqual(first.diagnostics.selectedKByDepth)
  })

  it.each(fixtures)("%s: matches the calibrated candidate builder exactly", (_name, corpus) => {
    // The shipped schedule/threshold are the calibrated values, so the promoted
    // builder must reproduce the Phase-1 candidate's partition.
    const shipped = build(corpus)
    const calibrated = buildAdaptiveClusters({
      embeddings: corpus.embeddings,
      depthSchedule: ADAPTIVE_TREE_DEPTH_SCHEDULE,
      restarts: TAXONOMY_KMEANS_RESTARTS,
      maxIter: TAXONOMY_KMEANS_MAX_ITER,
      tolerance: TAXONOMY_KMEANS_TOLERANCE,
      seed: corpus.seed,
      globalAbsoluteThreshold: ADAPTIVE_GLOBAL_ABSOLUTE_THRESHOLD,
    })
    expect(partitionSignature(shipped.root)).toBe(partitionSignature(calibrated.root))
    expect(shipped.diagnostics.routingThresholds).toEqual(calibrated.diagnostics.routingThresholds)
  })
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
