import type { HierarchicalTaxonomyPlan, TaxonomyBuildQualityMetrics } from "@domain/taxonomy"
import { describe, expect, it } from "vitest"
import {
  adaptiveGardenRunFields,
  adaptiveSpanAttributes,
  buildQualityFields,
  buildQualitySpanAttributes,
  nameQualitySpanAttributes,
} from "./taxonomy-gardening-telemetry.ts"

const scope = { organizationId: "o".repeat(24), projectId: "p".repeat(24) }

const diagnostics: NonNullable<HierarchicalTaxonomyPlan["decisionMetadata"]> = {
  nodeCount: 9,
  leafCount: 5,
  maxDepth: 2,
  acceptedSplits: 4,
  rejectedCandidates: 3,
  selectedKByDepth: { 0: [4], 1: [3, 2] },
  acceptedRelativeSeparations: [0.4, 0.9, 1.6],
  routingThresholds: [0.6, 0.7, 0.8],
  rejectionReasonCounts: { undersizedChild: 1, dominantChild: 0, lowScore: 2, lowRelativeSeparation: 0 },
  bestRootSeparation: 1.8,
  escalated: true,
  escalationSkipped: false,
  projectedRootSearchWork: 120,
  fellBackToStatic: false,
}

const plan = (overrides: Partial<HierarchicalTaxonomyPlan> = {}): HierarchicalTaxonomyPlan =>
  ({
    mode: "enforced",
    observationsSampled: 4_000,
    fallbackReason: null,
    adaptiveDurationMs: 1_234,
    staticDurationMs: 0,
    adaptiveBuildError: null,
    clustersBorn: 5,
    clustersContinued: 4,
    clustersDeprecated: 2,
    decisionMetadata: diagnostics,
    ...overrides,
  }) as HierarchicalTaxonomyPlan

// The dashboard (suz-mb6-27u) reads these by name; a rename empties a widget instead of failing a build.
const REQUIRED_SPAN_TAGS = [
  "taxonomy.adaptive.mode",
  "taxonomy.adaptive.fallbackReason",
  "taxonomy.adaptive.buildError",
  "taxonomy.adaptive.durationMs",
  "taxonomy.adaptive.peakRssBytes",
  "taxonomy.adaptive.observationsSampled",
  "taxonomy.adaptive.nodeCount",
  "taxonomy.adaptive.leafCount",
  "taxonomy.adaptive.maxDepth",
  "taxonomy.adaptive.relSep.p10",
  "taxonomy.adaptive.relSep.p50",
  "taxonomy.adaptive.relSep.p90",
] as const

describe("adaptiveSpanAttributes", () => {
  it("carries every field the rollout dashboard reads", () => {
    const attributes = adaptiveSpanAttributes(scope, plan())

    for (const tag of REQUIRED_SPAN_TAGS) expect(attributes).toHaveProperty(tag)
    expect(attributes["taxonomy.adaptive.durationMs"]).toBe(1_234)
    expect(attributes["taxonomy.adaptive.relSep.p50"]).toBeCloseTo(0.9)
    expect(attributes["taxonomy.adaptive.escalated"]).toBe(1)
  })

  it("emits no static-vs-adaptive comparison — shadow mode is retired", () => {
    const attributes = adaptiveSpanAttributes(scope, plan())

    expect(Object.keys(attributes).filter((key) => key.startsWith("taxonomy.shadow."))).toEqual([])
  })

  it("reports a failed adaptive build with its reason and the time it burned", () => {
    const attributes = adaptiveSpanAttributes(
      scope,
      plan({
        fallbackReason: "buildError",
        adaptiveBuildError: "worker terminated",
        adaptiveDurationMs: 300_000,
        staticDurationMs: 42,
        decisionMetadata: null,
      }),
    )

    expect(attributes["taxonomy.adaptive.fallbackReason"]).toBe("buildError")
    expect(attributes["taxonomy.adaptive.buildError"]).toBe("worker terminated")
    expect(attributes["taxonomy.adaptive.durationMs"]).toBe(300_000)
    // Static built the fallback tree, so its duration is the only non-zero one.
    expect(attributes["taxonomy.adaptive.staticDurationMs"]).toBe(42)
    expect(attributes).not.toHaveProperty("taxonomy.adaptive.nodeCount")
  })
})

describe("adaptiveGardenRunFields", () => {
  it("summarizes distributions as percentiles and never carries the raw arrays", () => {
    const fields = adaptiveGardenRunFields(scope, plan())

    expect(fields.relativeSeparation).toEqual({
      p10: expect.any(Number),
      p50: expect.any(Number),
      p90: expect.any(Number),
    })
    expect(fields.nodeCount).toBe(9)
    expect(fields.peakRssBytes).toBeGreaterThan(0)
    expect(JSON.stringify(fields)).not.toContain("acceptedRelativeSeparations")
  })
})

const qualityMetrics: TaxonomyBuildQualityMetrics = {
  membersClustered: 1_500,
  leafCount: 8,
  largestLeafShare: 0.868,
  topLevelRowCount: 8,
  largestTopLevelShare: 0.868,
  promotedResidue: 0,
  centeredCohesion: { p10: 0.249, p50: 0.684, p90: 0.862, min: 0.11 },
  leaves: [
    { size: 1_302, centeredCohesion: 0.249 },
    { size: 52, centeredCohesion: 0.684 },
    { size: 43, centeredCohesion: 0.862 },
  ],
}

describe("buildQualitySpanAttributes", () => {
  it("carries the shares, the leaf-size vector, and the worst leaf's centered cohesion", () => {
    const attributes = buildQualitySpanAttributes(scope, plan({ mode: "off" }), qualityMetrics)

    expect(attributes["taxonomy.quality.largestLeafShare"]).toBeCloseTo(0.868)
    expect(attributes["taxonomy.quality.leafSizes"]).toBe("1302,52,43")
    // Taken over every leaf, so a low-cohesion leaf outside the bounded profile still shows here.
    expect(attributes["taxonomy.quality.centeredCohesion.min"]).toBeCloseTo(0.11)
    // Emitted for every mode, unlike the adaptive attributes.
    expect(attributes["taxonomy.quality.mode"]).toBe("off")
  })

  it("reports how many leaves the profile bound dropped rather than truncating silently", () => {
    const attributes = buildQualitySpanAttributes(scope, plan(), qualityMetrics)

    expect(attributes["taxonomy.quality.leavesOmitted"]).toBe(5)
  })
})

describe("buildQualityFields", () => {
  it("logs the sorted leaf vector and the per-leaf cohesions alongside it", () => {
    const fields = buildQualityFields(scope, plan(), qualityMetrics)

    expect(fields.leafSizes).toEqual([1_302, 52, 43])
    expect(fields.centeredCohesionByLeaf).toEqual([0.249, 0.684, 0.862])
    expect(fields.topLevelRowCount).toBe(8)
  })
})

describe("nameQualitySpanAttributes", () => {
  it("separates cross-branch collisions from the sibling ones the gate already blocks", () => {
    const attributes = nameQualitySpanAttributes(scope, {
      leafCount: 10,
      namedLeafCount: 10,
      duplicateNameRate: 0.4,
      duplicateNameLeafCount: 4,
      crossBranchDuplicateLeafCount: 2,
      sharedSiblingWordShare: 0.9,
    })

    expect(attributes["taxonomy.quality.duplicateNameRate"]).toBeCloseTo(0.4)
    expect(attributes["taxonomy.quality.crossBranchDuplicateLeafCount"]).toBe(2)
    expect(attributes["taxonomy.quality.sharedSiblingWordShare"]).toBeCloseTo(0.9)
  })
})
