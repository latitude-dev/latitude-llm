import { costScoreEvidenceSchema, scoreEvidenceContractSchema } from "@domain/shared"
import { describe, expect, it } from "vitest"
import {
  COST_ESTIMATOR_CHANNEL,
  COST_FAMILIES,
  COST_FAMILY_CANONICAL_UNIT,
  COST_FAMILY_RAW_UNITS,
  type CostMetricEvaluation,
  costAggregationModeSchema,
  costFamilyMeasurementStateSchema,
  costFamilySchema,
  costMeasurementStatusOf,
  costMeasurementStatusSchema,
  costMetricApplicabilitySchema,
  costMetricEvaluationSchema,
  costMetricHealthSchema,
  costMetricMeasurementStateSchema,
  costMetricReadabilitySchema,
  costRawUnitSchema,
  costSourceClaimSchema,
  estimateRangeSchema,
  isCostEstimatorChannel,
  isCostRawUnitOfFamily,
  sessionCostMetricEvaluationSchema,
  toSessionCostMetricEvaluation,
} from "./cost-evidence.ts"

const readableToolEvaluation = {
  metricId: "tools.repeated_call",
  family: "tools",
  rawUnit: "toolCalls",
  aggregation: "eventRate",
  applicability: "applicable",
  readability: "readable",
  rawValue: 0.4,
  status: "watch",
  penalty: 0.2,
  eligibleUnits: 10,
  penalizedUnits: 2,
  sourceClaims: [{ atomId: "toolCall:call-1", eligibleUnits: 1, penalizedUnits: 1 }],
} satisfies CostMetricEvaluation

describe("Cost evidence vocabulary", () => {
  it("fixes the five Cost families and their canonical denominators", () => {
    expect(COST_FAMILIES).toEqual(["spend", "context", "tools", "memory", "recovery"])
    expect(costFamilySchema.options).toEqual([...COST_FAMILIES])
    expect(costFamilySchema.safeParse("latency").success).toBe(false)
    for (const family of COST_FAMILIES) {
      expect(COST_FAMILY_RAW_UNITS[family]).toContain(COST_FAMILY_CANONICAL_UNIT[family])
    }
  })

  it("bounds aggregation modes, applicability, readability, and status vocabularies", () => {
    expect(costAggregationModeSchema.options).toEqual(["resourceRatio", "eventRate", "sessionMean"])
    expect(costMetricApplicabilitySchema.options).toEqual(["applicable", "notApplicable"])
    expect(costMetricReadabilitySchema.options).toEqual(["readable", "unreadable"])
    expect(costMetricHealthSchema.options).toEqual(["healthy", "watch", "poor"])
    expect(costMeasurementStatusSchema.options).toEqual(["healthy", "watch", "poor", "unmeasured", "notApplicable"])
    expect(costMetricMeasurementStateSchema.options).toEqual(["measured", "unmeasured", "notApplicable"])
    expect(costFamilyMeasurementStateSchema.options).toEqual(["measured", "partial", "unmeasured", "notApplicable"])
    expect(costAggregationModeSchema.safeParse("windowMean").success).toBe(false)
    expect(costMeasurementStatusSchema.safeParse("unknown").success).toBe(false)
  })

  it("only accepts raw units that belong to the family", () => {
    expect(isCostRawUnitOfFamily({ family: "spend", rawUnit: "microcents" })).toBe(true)
    expect(isCostRawUnitOfFamily({ family: "context", rawUnit: "cacheTokens" })).toBe(true)
    expect(isCostRawUnitOfFamily({ family: "spend", rawUnit: "toolCalls" })).toBe(false)
    expect(isCostRawUnitOfFamily({ family: "memory", rawUnit: "completedSessions" })).toBe(false)
    expect(costRawUnitSchema.safeParse("dollars").success).toBe(false)
  })
})

describe("estimateRangeSchema", () => {
  it("accepts a bare point estimate and a bounded range with its meaning", () => {
    expect(estimateRangeSchema.parse({ unit: "microcents", point: 400 })).toEqual({
      unit: "microcents",
      point: 400,
    })
    expect(
      estimateRangeSchema.parse({
        unit: "microcents",
        point: 400,
        lower: 250,
        upper: 900,
        interpretation: "identificationBound",
      }).interpretation,
    ).toBe("identificationBound")
  })

  it("rejects inverted bounds, a bound without a stated meaning, and a missing unit", () => {
    expect(
      estimateRangeSchema.safeParse({
        unit: "microcents",
        point: 400,
        lower: 500,
        interpretation: "confidenceInterval",
      }).success,
    ).toBe(false)
    expect(
      estimateRangeSchema.safeParse({
        unit: "microcents",
        point: 400,
        upper: 300,
        interpretation: "confidenceInterval",
      }).success,
    ).toBe(false)
    expect(estimateRangeSchema.safeParse({ unit: "microcents", point: 400, upper: 900 }).success).toBe(false)
    expect(estimateRangeSchema.safeParse({ unit: "", point: 1 }).success).toBe(false)
    expect(estimateRangeSchema.safeParse({ unit: "microcents", point: Number.POSITIVE_INFINITY }).success).toBe(false)
  })
})

describe("costSourceClaimSchema", () => {
  it("requires a stable atom id and penalized units within the atom's eligible units", () => {
    expect(costSourceClaimSchema.parse({ atomId: "span:s1", eligibleUnits: 10, penalizedUnits: 10 })).toEqual({
      atomId: "span:s1",
      eligibleUnits: 10,
      penalizedUnits: 10,
    })
    expect(costSourceClaimSchema.safeParse({ atomId: "", eligibleUnits: 1, penalizedUnits: 0 }).success).toBe(false)
    expect(costSourceClaimSchema.safeParse({ atomId: "span:s1", eligibleUnits: 1, penalizedUnits: 2 }).success).toBe(
      false,
    )
    expect(costSourceClaimSchema.safeParse({ atomId: "span:s1", eligibleUnits: -1, penalizedUnits: 0 }).success).toBe(
      false,
    )
  })
})

describe("costMetricEvaluationSchema", () => {
  it("accepts a readable applicable evaluation with its source claims", () => {
    expect(costMetricEvaluationSchema.parse(readableToolEvaluation).penalizedUnits).toBe(2)
  })

  it("requires the measured fields when the metric is applicable and readable", () => {
    const { status: _status, ...withoutStatus } = readableToolEvaluation
    expect(costMetricEvaluationSchema.safeParse(withoutStatus).success).toBe(false)
  })

  it("rejects a raw unit that does not belong to the family", () => {
    expect(costMetricEvaluationSchema.safeParse({ ...readableToolEvaluation, family: "memory" }).success).toBe(false)
  })

  it("rejects penalized units above the family's eligible units and repeated source atoms", () => {
    expect(costMetricEvaluationSchema.safeParse({ ...readableToolEvaluation, penalizedUnits: 11 }).success).toBe(false)
    expect(
      costMetricEvaluationSchema.safeParse({
        ...readableToolEvaluation,
        sourceClaims: [
          { atomId: "toolCall:call-1", eligibleUnits: 1, penalizedUnits: 1 },
          { atomId: "toolCall:call-1", eligibleUnits: 1, penalizedUnits: 0 },
        ],
      }).success,
    ).toBe(false)
  })

  it("keeps a not-applicable evaluation free of measurement and claims", () => {
    const notApplicable = {
      metricId: "memory.noop_rewrite",
      family: "memory",
      rawUnit: "memoryWrites",
      aggregation: "eventRate",
      applicability: "notApplicable",
      readability: "readable",
      sourceClaims: [],
    } satisfies CostMetricEvaluation

    expect(costMetricEvaluationSchema.parse(notApplicable).applicability).toBe("notApplicable")
    expect(costMetricEvaluationSchema.safeParse({ ...notApplicable, penalty: 0.5 }).success).toBe(false)
    expect(costMetricEvaluationSchema.safeParse({ ...notApplicable, status: "healthy" }).success).toBe(false)
    expect(
      costMetricEvaluationSchema.safeParse({
        ...notApplicable,
        sourceClaims: [{ atomId: "memory:e1", eligibleUnits: 1, penalizedUnits: 0 }],
      }).success,
    ).toBe(false)
  })

  it("never lets an unreadable evaluation report health, and keeps its eligible units for coverage", () => {
    const unreadable = {
      metricId: "context.redundant_input_share",
      family: "context",
      rawUnit: "inputTokens",
      aggregation: "resourceRatio",
      applicability: "applicable",
      readability: "unreadable",
      eligibleUnits: 4_000,
      sourceClaims: [],
    } satisfies CostMetricEvaluation

    expect(costMetricEvaluationSchema.parse(unreadable).eligibleUnits).toBe(4_000)
    expect(costMetricEvaluationSchema.safeParse({ ...unreadable, status: "healthy" }).success).toBe(false)
    expect(costMetricEvaluationSchema.safeParse({ ...unreadable, penalty: 0 }).success).toBe(false)
    expect(
      costMetricEvaluationSchema.safeParse({
        ...unreadable,
        sourceClaims: [{ atomId: "span:s1", eligibleUnits: 1, penalizedUnits: 1 }],
      }).success,
    ).toBe(false)
  })
})

describe("toSessionCostMetricEvaluation", () => {
  it("keeps the session-safe subset and drops internal penalties and source claims", () => {
    const session = toSessionCostMetricEvaluation({
      ...readableToolEvaluation,
      nativeImpact: { unit: "toolCalls", point: 2 },
    })

    expect(sessionCostMetricEvaluationSchema.parse(session)).toEqual({
      family: "tools",
      measurementState: "measured",
      rawValue: 0.4,
      rawUnit: "toolCalls",
      nativeImpact: { unit: "toolCalls", point: 2 },
    })
    expect(session).not.toHaveProperty("penalty")
    expect(session).not.toHaveProperty("eligibleUnits")
    expect(session).not.toHaveProperty("penalizedUnits")
    expect(session).not.toHaveProperty("sourceClaims")
  })

  it("distinguishes unmeasured from not applicable", () => {
    const unreadable = {
      metricId: "tools.repeated_call",
      family: "tools",
      rawUnit: "toolCalls",
      aggregation: "eventRate",
      applicability: "applicable",
      readability: "unreadable",
      eligibleUnits: 10,
      sourceClaims: [],
    } satisfies CostMetricEvaluation
    const notApplicable = {
      metricId: "tools.repeated_call",
      family: "tools",
      rawUnit: "toolCalls",
      aggregation: "eventRate",
      applicability: "notApplicable",
      readability: "readable",
      sourceClaims: [],
    } satisfies CostMetricEvaluation

    expect(costMeasurementStatusOf(unreadable)).toBe("unmeasured")
    expect(toSessionCostMetricEvaluation(unreadable)).toEqual({ family: "tools", measurementState: "unmeasured" })
    expect(costMeasurementStatusOf(notApplicable)).toBe("notApplicable")
    expect(toSessionCostMetricEvaluation(notApplicable)).toEqual({
      family: "tools",
      measurementState: "notApplicable",
    })
    expect(costMeasurementStatusOf(readableToolEvaluation)).toBe("watch")
  })
})

describe("Cost estimator channel", () => {
  it("keeps the persisted cost/spendEfficiency contract readable without migration", () => {
    const persisted = { scoreDimension: "cost", role: "spendEfficiency" }

    expect(costScoreEvidenceSchema.parse(persisted)).toEqual(COST_ESTIMATOR_CHANNEL)
    expect(scoreEvidenceContractSchema.parse(persisted)).toEqual(COST_ESTIMATOR_CHANNEL)
    expect(isCostEstimatorChannel(scoreEvidenceContractSchema.parse(persisted))).toBe(true)
    expect(isCostEstimatorChannel({ scoreDimension: "speed", role: "criticalPathEfficiency" })).toBe(false)
  })

  it("does not persist a Cost family on the evidence contract", () => {
    expect(
      costScoreEvidenceSchema.parse({ scoreDimension: "cost", role: "spendEfficiency", family: "context" }),
    ).toEqual(COST_ESTIMATOR_CHANNEL)
  })
})
