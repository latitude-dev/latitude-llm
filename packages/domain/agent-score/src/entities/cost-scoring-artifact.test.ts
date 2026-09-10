import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { InvalidCostScoringArtifactError } from "../errors.ts"
import { COST_FAMILIES, type CostFamily } from "./cost-evidence.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "./cost-metric-catalog.ts"
import {
  type CostScoringArtifact,
  costMetricCurveSchema,
  costOverlapPolicySchema,
  costScoringArtifactSchema,
  loadCostScoringArtifact,
} from "./cost-scoring-artifact.ts"

const curve = {
  curveId: "tools.repeated_call",
  points: [
    { rawValue: 0, penalty: 0 },
    { rawValue: 0.1, penalty: 0 },
    { rawValue: 0.4, penalty: 0.3 },
    { rawValue: 1, penalty: 1 },
  ],
  healthyMaxRawValue: 0.1,
  watchMaxRawValue: 0.4,
}

const provisionalFamilyRecord = <Value>(value: Value): Record<CostFamily, Value> =>
  Object.fromEntries(COST_FAMILIES.map((family) => [family, value])) as Record<CostFamily, Value>

const artifact = {
  artifactVersion: "cost-artifact-test-provisional",
  calibration: "provisional",
  familyWeights: { spend: 0.2, context: 0.2, tools: 0.2, memory: 0.2, recovery: 0.2 },
  metricCurves: PROVISIONAL_COST_METRIC_CATALOG.entries.map((entry) => ({ ...curve, curveId: entry.curveId })),
  metricCaps: Object.fromEntries(PROVISIONAL_COST_METRIC_CATALOG.entries.map((entry) => [entry.metricId, 0.4])),
  familyCaps: provisionalFamilyRecord(0.5),
  familyCoverageRequirements: provisionalFamilyRecord({ required: false, coverageFloor: 0.5 }),
  overlapPolicies: [
    {
      overlapGroupId: "tools.repeated-calls",
      resolution: "maximum",
      metricIds: ["tools.repeated_call", "tools.thrashing"],
      overlapGroups: ["tools.repeated-calls"],
      families: ["tools"],
    },
    {
      overlapGroupId: "context.cache-tokens-and-spend",
      resolution: "combinedCap",
      metricIds: ["cost.cache_gap", "cost.recoverable_spend_share"],
      overlapGroups: [],
      families: ["context", "spend"],
      combinedCap: 0.3,
    },
  ],
  residualSignalCap: 0.1,
  tokenizerPolicy: { preferProviderTokenizer: true, fallbackEncoding: "o200k_base", fallbackRelativeBound: 0.15 },
} satisfies CostScoringArtifact

const load = (override: Partial<CostScoringArtifact>) =>
  Effect.runSync(
    Effect.result(
      loadCostScoringArtifact({ artifact: { ...artifact, ...override }, catalog: PROVISIONAL_COST_METRIC_CATALOG }),
    ),
  )

describe("costMetricCurveSchema", () => {
  it("accepts an ascending curve whose boundaries match its points", () => {
    expect(costMetricCurveSchema.parse(curve).curveId).toBe("tools.repeated_call")
  })

  it("requires strictly ascending raw values", () => {
    expect(
      costMetricCurveSchema.safeParse({
        ...curve,
        points: [
          { rawValue: 0, penalty: 0 },
          { rawValue: 0.1, penalty: 0 },
          { rawValue: 0.1, penalty: 0.3 },
        ],
      }).success,
    ).toBe(false)
    expect(
      costMetricCurveSchema.safeParse({
        ...curve,
        points: [
          { rawValue: 0, penalty: 0 },
          { rawValue: 0.4, penalty: 0.3 },
          { rawValue: 0.1, penalty: 0.5 },
        ],
      }).success,
    ).toBe(false)
  })

  it("requires non-decreasing penalties bounded by zero and one", () => {
    expect(
      costMetricCurveSchema.safeParse({
        ...curve,
        points: [
          { rawValue: 0, penalty: 0 },
          { rawValue: 0.1, penalty: 0.5 },
          { rawValue: 0.4, penalty: 0.3 },
        ],
      }).success,
    ).toBe(false)
    expect(
      costMetricCurveSchema.safeParse({
        ...curve,
        points: [
          { rawValue: 0, penalty: 0 },
          { rawValue: 0.1, penalty: 0 },
          { rawValue: 0.4, penalty: 1.2 },
        ],
      }).success,
    ).toBe(false)
    expect(
      costMetricCurveSchema.safeParse({
        ...curve,
        points: [
          { rawValue: 0, penalty: 0 },
          { rawValue: 0.4, penalty: -0.1 },
        ],
      }).success,
    ).toBe(false)
  })

  it("requires a zero-penalty start, two points, and non-negative finite raw values", () => {
    expect(
      costMetricCurveSchema.safeParse({
        ...curve,
        points: [
          { rawValue: 0, penalty: 0.2 },
          { rawValue: 0.4, penalty: 0.3 },
        ],
        healthyMaxRawValue: 0,
        watchMaxRawValue: 0.4,
      }).success,
    ).toBe(false)
    expect(costMetricCurveSchema.safeParse({ ...curve, points: [{ rawValue: 0, penalty: 0 }] }).success).toBe(false)
    expect(
      costMetricCurveSchema.safeParse({
        ...curve,
        points: [
          { rawValue: 0, penalty: 0 },
          { rawValue: Number.POSITIVE_INFINITY, penalty: 1 },
        ],
      }).success,
    ).toBe(false)
  })

  it("keeps the healthy, watch, and poor boundaries consistent with the curve", () => {
    expect(costMetricCurveSchema.safeParse({ ...curve, healthyMaxRawValue: 0.4, watchMaxRawValue: 0.4 }).success).toBe(
      false,
    )
    expect(costMetricCurveSchema.safeParse({ ...curve, healthyMaxRawValue: 0.25 }).success).toBe(false)
    expect(costMetricCurveSchema.safeParse({ ...curve, watchMaxRawValue: 0.9 }).success).toBe(false)
    expect(costMetricCurveSchema.safeParse({ ...curve, healthyMaxRawValue: 0.4, watchMaxRawValue: 1 }).success).toBe(
      false,
    )
    expect(costMetricCurveSchema.safeParse({ ...curve, watchMaxRawValue: 0.1 }).success).toBe(false)
  })
})

describe("costOverlapPolicySchema", () => {
  const policy = artifact.overlapPolicies[0]

  it("requires a reference to at least one metric or overlap group", () => {
    expect(costOverlapPolicySchema.safeParse({ ...policy, metricIds: [], overlapGroups: [] }).success).toBe(false)
    expect(costOverlapPolicySchema.safeParse({ ...policy, families: [] }).success).toBe(false)
  })

  it("pairs a combined cap with the combinedCap resolution only", () => {
    expect(costOverlapPolicySchema.safeParse({ ...policy, combinedCap: 0.2 }).success).toBe(false)
    expect(costOverlapPolicySchema.safeParse({ ...policy, resolution: "combinedCap" }).success).toBe(false)
    expect(costOverlapPolicySchema.safeParse({ ...policy, resolution: "combinedCap", combinedCap: 1.4 }).success).toBe(
      false,
    )
  })

  it("requires a combined cap for a cross-family policy and rejects unknown resolutions", () => {
    expect(
      costOverlapPolicySchema.safeParse({ ...policy, families: ["tools", "spend"], resolution: "union" }).success,
    ).toBe(false)
    expect(costOverlapPolicySchema.safeParse({ ...policy, resolution: "average" }).success).toBe(false)
    expect(costOverlapPolicySchema.parse(artifact.overlapPolicies[1]).combinedCap).toBe(0.3)
  })

  it("rejects repeated references", () => {
    expect(
      costOverlapPolicySchema.safeParse({ ...policy, metricIds: ["tools.thrashing", "tools.thrashing"] }).success,
    ).toBe(false)
    expect(
      costOverlapPolicySchema.safeParse({ ...policy, families: ["tools", "tools"], resolution: "combinedCap" }).success,
    ).toBe(false)
  })
})

describe("costScoringArtifactSchema", () => {
  it("accepts an artifact that covers all five families", () => {
    expect(costScoringArtifactSchema.parse(artifact).artifactVersion).toBe("cost-artifact-test-provisional")
  })

  it("requires every family in the weights, caps, and coverage requirements", () => {
    const { recovery: _recovery, ...missingWeight } = artifact.familyWeights
    const { memory: _memory, ...missingCap } = artifact.familyCaps
    const { spend: _spend, ...missingFloor } = artifact.familyCoverageRequirements

    expect(costScoringArtifactSchema.safeParse({ ...artifact, familyWeights: missingWeight }).success).toBe(false)
    expect(costScoringArtifactSchema.safeParse({ ...artifact, familyCaps: missingCap }).success).toBe(false)
    expect(costScoringArtifactSchema.safeParse({ ...artifact, familyCoverageRequirements: missingFloor }).success).toBe(
      false,
    )
  })

  it("requires family weights that are finite, non-negative, and sum to one", () => {
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        familyWeights: { spend: 0.3, context: 0.2, tools: 0.2, memory: 0.2, recovery: 0.2 },
      }).success,
    ).toBe(false)
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        familyWeights: { spend: -0.1, context: 0.3, tools: 0.3, memory: 0.3, recovery: 0.2 },
      }).success,
    ).toBe(false)
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        familyWeights: { spend: Number.POSITIVE_INFINITY, context: 0.2, tools: 0.2, memory: 0.2, recovery: 0.2 },
      }).success,
    ).toBe(false)
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        familyWeights: { spend: 1, context: 0, tools: 0, memory: 0, recovery: 0 },
      }).success,
    ).toBe(true)
  })

  it("bounds every cap, coverage floor, and the residual signal cap", () => {
    expect(costScoringArtifactSchema.safeParse({ ...artifact, residualSignalCap: 1.1 }).success).toBe(false)
    expect(costScoringArtifactSchema.safeParse({ ...artifact, residualSignalCap: -0.1 }).success).toBe(false)
    expect(costScoringArtifactSchema.safeParse({ ...artifact, familyCaps: provisionalFamilyRecord(1.2) }).success).toBe(
      false,
    )
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        familyCoverageRequirements: provisionalFamilyRecord({ required: true, coverageFloor: 2 }),
      }).success,
    ).toBe(false)
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        metricCaps: { ...artifact.metricCaps, "tools.thrashing": -1 },
      }).success,
    ).toBe(false)
  })

  it("rejects duplicate curve ids and duplicate overlap policy ids", () => {
    expect(costScoringArtifactSchema.safeParse({ ...artifact, metricCurves: [curve, { ...curve }] }).success).toBe(
      false,
    )
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        overlapPolicies: [artifact.overlapPolicies[0], { ...artifact.overlapPolicies[0] }],
      }).success,
    ).toBe(false)
  })

  it("requires a tokenizer policy with a bounded fallback", () => {
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        tokenizerPolicy: { preferProviderTokenizer: true, fallbackEncoding: "cl100k_base", fallbackRelativeBound: 0.1 },
      }).success,
    ).toBe(false)
    expect(
      costScoringArtifactSchema.safeParse({
        ...artifact,
        tokenizerPolicy: { preferProviderTokenizer: true, fallbackEncoding: "o200k_base", fallbackRelativeBound: 3 },
      }).success,
    ).toBe(false)
  })
})

describe("loadCostScoringArtifact", () => {
  it("resolves every catalog curve and metric cap", () => {
    expect(load({})._tag).toBe("Success")
  })

  it("fails when a catalog metric has no curve", () => {
    const result = load({ metricCurves: [curve] })

    expect(result._tag).toBe("Failure")
    if (result._tag === "Failure") {
      expect(result.failure).toBeInstanceOf(InvalidCostScoringArtifactError)
      expect(result.failure.artifactVersion).toBe(artifact.artifactVersion)
      expect(result.failure.issues.join(" ")).toContain("references unknown curve")
    }
  })

  it("fails when a catalog metric has no cap and when a cap names an unknown metric", () => {
    const { "memory.noop_rewrite": _missing, ...withoutCap } = artifact.metricCaps
    const missingCap = load({ metricCaps: withoutCap })
    const unknownCap = load({ metricCaps: { ...artifact.metricCaps, "cost.invented_metric": 0.2 } })

    expect(missingCap._tag === "Failure" && missingCap.failure.issues.join(" ")).toContain(
      "memory.noop_rewrite has no cap",
    )
    expect(unknownCap._tag === "Failure" && unknownCap.failure.issues.join(" ")).toContain("is not a catalog metric")
  })

  it("fails when an overlap policy references an unknown metric or overlap group", () => {
    const unknownMetric = load({
      overlapPolicies: [{ ...artifact.overlapPolicies[0], metricIds: ["tools.invented"] }],
    })
    const unknownGroup = load({
      overlapPolicies: [{ ...artifact.overlapPolicies[0], overlapGroups: ["tools.invented-group"] }],
    })

    expect(unknownMetric._tag === "Failure" && unknownMetric.failure.issues.join(" ")).toContain(
      "is not a catalog metric",
    )
    expect(unknownGroup._tag === "Failure" && unknownGroup.failure.issues.join(" ")).toContain(
      "is not a catalog overlap group",
    )
  })
})
