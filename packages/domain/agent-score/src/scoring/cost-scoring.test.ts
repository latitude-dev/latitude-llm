import { describe, expect, it } from "vitest"
import { COST_FAMILIES, type CostFamily } from "../entities/cost-evidence.ts"
import type { CostMetricCatalog } from "../entities/cost-metric-catalog.ts"
import { PROVISIONAL_COST_METRIC_CATALOG } from "../entities/cost-metric-catalog.ts"
import type { CostMetricReading } from "../entities/cost-metric-reading.ts"
import type { CostMetricCurve, CostScoringArtifact } from "../entities/cost-scoring-artifact.ts"
import { latencyReferenceArtifactSchema } from "../entities/latency-reference-artifact.ts"
import { aggregateSessionCost, type CostFamilyDenominators } from "./aggregate-session-cost.ts"
import { arbitrateCostAtoms } from "./arbitrate-cost-atoms.ts"
import { costHealthForRawValue, evaluateCostMetric, interpolateCostPenalty } from "./evaluate-cost-curve.ts"

const curve: CostMetricCurve = {
  curveId: "test.curve",
  points: [
    { rawValue: 0, penalty: 0 },
    { rawValue: 0.1, penalty: 0 },
    { rawValue: 0.5, penalty: 0.4 },
    { rawValue: 1, penalty: 1 },
  ],
  healthyMaxRawValue: 0.1,
  watchMaxRawValue: 0.5,
}

const familyRecord = <Value>(value: Value): Record<CostFamily, Value> =>
  Object.fromEntries(COST_FAMILIES.map((family) => [family, value])) as Record<CostFamily, Value>

const catalog: CostMetricCatalog = PROVISIONAL_COST_METRIC_CATALOG

const artifact = (overrides: Partial<CostScoringArtifact> = {}): CostScoringArtifact => ({
  artifactVersion: "cost-artifact-scoring-test",
  calibration: "provisional",
  familyWeights: { spend: 0.2, context: 0.2, tools: 0.2, memory: 0.2, recovery: 0.2 },
  metricCurves: catalog.entries.map((entry) => ({ ...curve, curveId: entry.curveId })),
  metricCaps: Object.fromEntries(catalog.entries.map((entry) => [entry.metricId, 1])),
  familyCaps: familyRecord(1),
  familyCoverageRequirements: familyRecord({ required: false, coverageFloor: 0.5 }),
  overlapPolicies: [],
  residualSignalCap: 0.1,
  tokenizerPolicy: { preferProviderTokenizer: true, fallbackEncoding: "o200k_base", fallbackRelativeBound: 0.1 },
  ...overrides,
})

const denominators: CostFamilyDenominators = {
  spend: 10_000,
  context: 50_000,
  tools: 10,
  memory: 4,
  recovery: 1,
}

const reading = (overrides: Partial<CostMetricReading> = {}): CostMetricReading => ({
  metricId: "tools.repeated_call",
  family: "tools",
  rawUnit: "toolCalls",
  aggregation: "eventRate",
  applicability: "applicable",
  readability: "readable",
  rawValue: 0.3,
  eligibleUnits: 10,
  adverseUnits: 3,
  observations: [
    { atomId: "toolCall:t:1", eligibleUnits: 1, adverseUnits: 1 },
    { atomId: "toolCall:t:2", eligibleUnits: 1, adverseUnits: 1 },
    { atomId: "toolCall:t:3", eligibleUnits: 1, adverseUnits: 1 },
  ],
  evidence: "modeled",
  limitations: [],
  ...overrides,
})

describe("interpolateCostPenalty", () => {
  it("interpolates linearly between adjacent points", () => {
    expect(interpolateCostPenalty({ curve, rawValue: 0.3 })).toBeCloseTo(0.2, 9)
    expect(interpolateCostPenalty({ curve, rawValue: 0.75 })).toBeCloseTo(0.7, 9)
  })

  it("clamps outside the first and last point", () => {
    expect(interpolateCostPenalty({ curve, rawValue: -5 })).toBe(0)
    expect(interpolateCostPenalty({ curve, rawValue: 50 })).toBe(1)
  })

  it("returns each point's own penalty at the point", () => {
    for (const point of curve.points) {
      expect(interpolateCostPenalty({ curve, rawValue: point.rawValue })).toBeCloseTo(point.penalty, 9)
    }
  })

  it("charges nothing across the whole healthy range and something past it", () => {
    for (const rawValue of [0, 0.02, 0.05, 0.099, 0.1]) {
      expect(interpolateCostPenalty({ curve, rawValue })).toBe(0)
    }
    expect(interpolateCostPenalty({ curve, rawValue: 0.1001 })).toBeGreaterThan(0)
  })

  it("never decreases as the raw value grows, for every provisional curve", () => {
    for (const provisional of artifact().metricCurves) {
      let previous = -1
      for (let step = 0; step <= 200; step += 1) {
        const penalty = interpolateCostPenalty({ curve: provisional, rawValue: step / 100 })
        expect(penalty).toBeGreaterThanOrEqual(previous)
        expect(penalty).toBeGreaterThanOrEqual(0)
        expect(penalty).toBeLessThanOrEqual(1)
        previous = penalty
      }
    }
  })

  it("has no step at a range boundary", () => {
    const epsilon = 1e-6
    for (const boundary of [curve.healthyMaxRawValue, curve.watchMaxRawValue]) {
      const before = interpolateCostPenalty({ curve, rawValue: boundary - epsilon })
      const after = interpolateCostPenalty({ curve, rawValue: boundary + epsilon })
      expect(Math.abs(after - before)).toBeLessThan(1e-3)
    }
  })
})

describe("costHealthForRawValue", () => {
  it("names the range the curve declares, boundaries inclusive of the lower band", () => {
    expect(costHealthForRawValue({ curve, rawValue: 0 })).toBe("healthy")
    expect(costHealthForRawValue({ curve, rawValue: 0.1 })).toBe("healthy")
    expect(costHealthForRawValue({ curve, rawValue: 0.11 })).toBe("watch")
    expect(costHealthForRawValue({ curve, rawValue: 0.5 })).toBe("watch")
    expect(costHealthForRawValue({ curve, rawValue: 0.51 })).toBe("poor")
  })
})

describe("evaluateCostMetric", () => {
  const evaluate = (input: CostMetricReading, overrides: Partial<CostScoringArtifact> = {}) =>
    evaluateCostMetric({
      reading: input,
      artifact: artifact(overrides),
      curveId: "tools.repeated_call",
      familyEligibleUnits: denominators.tools,
    })

  it("charges the penalty against the family's denominator, not the metric's", () => {
    const evaluation = evaluate(reading())

    expect(evaluation.penalty).toBeCloseTo(0.2, 9)
    expect(evaluation.eligibleUnits).toBe(10)
    expect(evaluation.penalizedUnits).toBeCloseTo(2, 9)
    expect(evaluation.status).toBe("watch")
  })

  it("splits penalized units across the atoms actually to blame", () => {
    const evaluation = evaluate(reading())

    expect(evaluation.sourceClaims).toHaveLength(3)
    expect(evaluation.sourceClaims.every((claim) => claim.penalizedUnits <= claim.eligibleUnits)).toBe(true)
  })

  it("honours the metric cap", () => {
    const capped = evaluate(reading({ rawValue: 1 }), {
      metricCaps: { ...artifact().metricCaps, "tools.repeated_call": 0.25 },
    })

    expect(capped.penalty).toBe(0.25)
  })

  it("carries a not-applicable or unreadable reading through without scoring it", () => {
    expect(evaluate(reading({ applicability: "notApplicable", rawValue: undefined, observations: [] }))).toMatchObject({
      applicability: "notApplicable",
      sourceClaims: [],
    })
    expect(
      evaluate(reading({ readability: "unreadable", rawValue: undefined, observations: [] })).penalty,
    ).toBeUndefined()
  })

  it("treats a missing curve as unreadable rather than as zero penalty", () => {
    const evaluation = evaluateCostMetric({
      reading: reading(),
      artifact: artifact({ metricCurves: [] }),
      curveId: "tools.repeated_call",
      familyEligibleUnits: 10,
    })

    expect(evaluation).toMatchObject({ readability: "unreadable" })
    expect(evaluation.penalty).toBeUndefined()
  })
})

describe("arbitrateCostAtoms", () => {
  const repeated = reading({
    metricId: "tools.repeated_call",
    rawValue: 0.5,
    adverseUnits: 5,
    observations: [1, 2, 3, 4, 5].map((index) => ({
      atomId: `toolCall:t:${index}`,
      eligibleUnits: 1,
      adverseUnits: 1,
    })),
  })
  const thrashing = reading({
    metricId: "tools.thrashing",
    rawValue: 0.3,
    adverseUnits: 3,
    observations: [1, 2, 3].map((index) => ({ atomId: `toolCall:t:${index}`, eligibleUnits: 1, adverseUnits: 1 })),
  })

  it("gives the larger claim the overlapping atoms and leaves the remainder to the other", () => {
    const arbitration = arbitrateCostAtoms([repeated, thrashing])
    const byMetric = new Map(arbitration.readings.map((entry) => [entry.reading.metricId, entry]))

    expect(byMetric.get("tools.repeated_call")?.effectiveAdverseUnits).toBe(5)
    expect(byMetric.get("tools.thrashing")?.effectiveAdverseUnits).toBe(0)
    expect(arbitration.ownedAtomsByFamily.get("tools")?.size).toBe(5)
  })

  it("lets exact evidence take an atom from a larger estimate", () => {
    const exact = reading({
      metricId: "tools.structural_defect",
      evidence: "confirmed",
      rawValue: 0.1,
      adverseUnits: 1,
      observations: [{ atomId: "toolCall:t:1", eligibleUnits: 1, adverseUnits: 1 }],
    })
    const byMetric = new Map(
      arbitrateCostAtoms([repeated, exact]).readings.map((entry) => [entry.reading.metricId, entry]),
    )

    expect(byMetric.get("tools.structural_defect")?.ownedAtomIds).toEqual(["toolCall:t:1"])
    expect(byMetric.get("tools.repeated_call")?.effectiveAdverseUnits).toBe(4)
    expect(byMetric.get("tools.repeated_call")?.cededAtomIds).toEqual(["toolCall:t:1"])
  })

  it("scales the loser's raw value by what it kept", () => {
    const partial = reading({
      metricId: "tools.thrashing",
      rawValue: 0.5,
      adverseUnits: 5,
      observations: [1, 2, 3, 4, 5].map((index) => ({
        atomId: `toolCall:t:${index}`,
        eligibleUnits: 1,
        adverseUnits: 1,
      })),
    })
    const smaller = reading({
      metricId: "tools.repeated_call",
      rawValue: 0.2,
      adverseUnits: 2,
      observations: [4, 5].map((index) => ({ atomId: `toolCall:t:${index}`, eligibleUnits: 1, adverseUnits: 1 })),
    })
    const byMetric = new Map(
      arbitrateCostAtoms([partial, smaller]).readings.map((entry) => [entry.reading.metricId, entry]),
    )

    expect(byMetric.get("tools.thrashing")?.effectiveRawValue).toBeCloseTo(0.5, 9)
    expect(byMetric.get("tools.repeated_call")?.effectiveRawValue).toBe(0)
  })

  it("lets one event inform two families when the resources genuinely differ", () => {
    const contextClaim = reading({
      metricId: "context.redundant_input_share",
      family: "context",
      rawUnit: "inputTokens",
      aggregation: "resourceRatio",
      rawValue: 0.1,
      eligibleUnits: 1_000,
      adverseUnits: 100,
      observations: [{ atomId: "toolResult:abc", eligibleUnits: 100, adverseUnits: 100 }],
    })
    const arbitration = arbitrateCostAtoms([repeated, contextClaim])

    expect(arbitration.ownedAtomsByFamily.get("tools")?.size).toBe(5)
    expect(arbitration.ownedAtomsByFamily.get("context")?.size).toBe(1)
  })

  it("ignores unreadable and not-applicable readings entirely", () => {
    const arbitration = arbitrateCostAtoms([
      reading({ readability: "unreadable", rawValue: undefined, observations: [] }),
      reading({ metricId: "tools.thrashing", applicability: "notApplicable", rawValue: undefined, observations: [] }),
    ])

    expect(arbitration.ownedAtomsByFamily.size).toBe(0)
    expect(arbitration.readings.every((entry) => entry.effectiveAdverseUnits === 0)).toBe(true)
  })
})

describe("aggregateSessionCost", () => {
  const aggregate = (
    readings: readonly CostMetricReading[],
    overrides: Partial<CostScoringArtifact> = {},
    residualSignalPenalty = 0,
  ) =>
    aggregateSessionCost({
      readings,
      artifact: artifact(overrides),
      catalog,
      denominators,
      residualSignalPenalty,
    })

  const familyOf = (result: ReturnType<typeof aggregate>, family: CostFamily) =>
    result.families.find((entry) => entry.family === family)

  it("always reports all five families", () => {
    expect(aggregate([]).families.map((entry) => entry.family)).toEqual([...COST_FAMILIES])
  })

  it("charges a family once when two metrics blame the same calls", () => {
    const shared = [1, 2, 3].map((index) => ({
      atomId: `toolCall:t:${index}`,
      eligibleUnits: 1,
      adverseUnits: 1,
    }))
    const both = aggregate([
      reading({ metricId: "tools.repeated_call", rawValue: 0.3, adverseUnits: 3, observations: shared }),
      reading({ metricId: "tools.thrashing", rawValue: 0.3, adverseUnits: 3, observations: shared }),
    ])
    const one = aggregate([
      reading({ metricId: "tools.repeated_call", rawValue: 0.3, adverseUnits: 3, observations: shared }),
    ])

    expect(familyOf(both, "tools")?.penalty).toBeCloseTo(familyOf(one, "tools")?.penalty ?? -1, 9)
  })

  it("never lets a family exceed its own cap or one whole family", () => {
    const capped = aggregate([reading({ rawValue: 1, adverseUnits: 10 })], {
      familyCaps: { ...familyRecord(1), tools: 0.3 },
    })

    expect(familyOf(capped, "tools")?.penalty).toBe(0.3)
    expect(familyOf(capped, "tools")?.penalizedUnits).toBeCloseTo(3, 9)
  })

  it("keeps weights fixed when a family is not applicable", () => {
    const only = aggregate([
      reading({ rawValue: 1, adverseUnits: 10 }),
      ...COST_FAMILIES.filter((family) => family !== "tools").map((family) =>
        reading({
          metricId: `${family}.absent`,
          family,
          rawUnit:
            family === "spend"
              ? "microcents"
              : family === "context"
                ? "inputTokens"
                : family === "memory"
                  ? "memoryWrites"
                  : "completedSessions",
          applicability: "notApplicable",
          rawValue: undefined,
          adverseUnits: undefined,
          eligibleUnits: undefined,
          observations: [],
        }),
      ),
    ])

    expect(only.costPenalty).toBeCloseTo(0.2, 9)
  })

  it("shares a cap across an overlap group", () => {
    const shared = aggregate(
      [
        reading({
          metricId: "tools.repeated_call",
          rawValue: 1,
          adverseUnits: 10,
          observations: [{ atomId: "toolCall:a", eligibleUnits: 1, adverseUnits: 10 }],
        }),
        reading({
          metricId: "tools.structural_defect",
          rawValue: 1,
          adverseUnits: 10,
          evidence: "confirmed",
          observations: [{ atomId: "toolCall:b", eligibleUnits: 1, adverseUnits: 10 }],
        }),
      ],
      {
        overlapPolicies: [
          {
            overlapGroupId: "tools.shared",
            resolution: "combinedCap",
            metricIds: ["tools.repeated_call", "tools.structural_defect"],
            overlapGroups: [],
            families: ["tools"],
            combinedCap: 0.5,
          },
        ],
      },
    )

    expect(familyOf(shared, "tools")?.penalty).toBeCloseTo(0.5, 9)
  })

  it("reports an unreadable applicable metric as lowering coverage, never as healthy", () => {
    const partial = aggregate([
      reading({ metricId: "tools.repeated_call", readability: "unreadable", rawValue: undefined, observations: [] }),
      reading({ metricId: "tools.thrashing", rawValue: 0, adverseUnits: 0, observations: [] }),
    ])

    expect(familyOf(partial, "tools")).toMatchObject({ coverage: 0.5, status: "unmeasured" })
  })

  it("withholds Cost when a required family applies but misses its coverage floor", () => {
    const withheld = aggregate([reading({ readability: "unreadable", rawValue: undefined, observations: [] })], {
      familyCoverageRequirements: {
        ...familyRecord({ required: false, coverageFloor: 0.5 }),
        tools: { required: true, coverageFloor: 0.8 },
      },
    })

    expect(withheld.publishable).toBe(false)
    expect(withheld.withheldFamilies).toEqual(["tools"])
  })

  it("does not withhold when a required family simply does not apply", () => {
    const notApplicable = aggregate([], {
      familyCoverageRequirements: {
        ...familyRecord({ required: false, coverageFloor: 0.5 }),
        tools: { required: true, coverageFloor: 0.8 },
      },
    })

    expect(notApplicable.publishable).toBe(true)
  })

  it("adds a residual signal penalty on top and stays inside zero through one", () => {
    expect(aggregate([reading({ rawValue: 1, adverseUnits: 10 })], {}, 0.05).costPenalty).toBeCloseTo(0.25, 9)
    expect(aggregate([reading({ rawValue: 1, adverseUnits: 10 })], {}, 5).costPenalty).toBe(1)
  })

  it("charges nothing for a family whose denominator is empty", () => {
    const empty = aggregateSessionCost({
      readings: [reading({ rawValue: 1, adverseUnits: 10 })],
      artifact: artifact(),
      catalog,
      denominators: { ...denominators, tools: 0 },
    })

    expect(familyOf(empty, "tools")).toMatchObject({ penalty: 0, penalizedUnits: 0 })
  })
})

describe("latency artifact still validates alongside the scoring artifact", () => {
  it("keeps the two artifacts independent", () => {
    expect(
      latencyReferenceArtifactSchema.safeParse({
        artifactVersion: "v",
        calibration: "provisional",
        minimumSampleCount: 30,
        minimumOrganizationCount: 5,
        ttft: [],
        throughput: [],
      }).success,
    ).toBe(true)
  })
})
