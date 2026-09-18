import { z } from "zod"
import {
  costAggregationModeSchema,
  costFamilySchema,
  costMetricApplicabilitySchema,
  costMetricMeasurementStateOf,
  costMetricMeasurementStateSchema,
  costMetricReadabilitySchema,
  costRawUnitSchema,
  estimateRangeSchema,
  isCostRawUnitOfFamily,
} from "./cost-evidence.ts"

/**
 * One resource atom as a reader saw it, before any curve runs.
 *
 * `adverseUnits` is the observed bad share of the atom — a repeated call, a redundant token, a
 * recovered incident — not a penalty. Turning that into penalized units is the scoring artifact's
 * job, so a reader can never decide how much a finding is worth.
 */
export const costSourceObservationSchema = z
  .object({
    atomId: z.string().min(1),
    eligibleUnits: z.number().nonnegative(),
    adverseUnits: z.number().nonnegative(),
  })
  .superRefine((observation, ctx) => {
    if (observation.adverseUnits > observation.eligibleUnits) {
      ctx.addIssue({
        code: "custom",
        path: ["adverseUnits"],
        message: "an atom cannot be more adverse than it is eligible",
      })
    }
  })
export type CostSourceObservation = z.infer<typeof costSourceObservationSchema>

/**
 * Whether a native impact is exact or modeled.
 *
 * `confirmed` — the impact follows from evidence that pins it: an attributable paid generation, a
 * marginal critical-path segment, a proven redundancy.
 * `modeled` — the behaviour is observed but its consequence is estimated, so the reading may carry
 * identification bounds and cannot claim exactness.
 */
export const COST_EVIDENCE_STRENGTHS = ["confirmed", "modeled"] as const
export const costEvidenceStrengthSchema = z.enum(COST_EVIDENCE_STRENGTHS)
export type CostEvidenceStrength = z.infer<typeof costEvidenceStrengthSchema>

/** Why a reading could not see everything it needed. Lowers coverage; never raises a score. */
export const COST_READING_LIMITATIONS = [
  "missingContent",
  "truncatedContent",
  "missingPricing",
  "unknownModelContext",
  "unknownToolContract",
  "criticalPathUnavailable",
  "insufficientComparableCalls",
  "definitionPeriodIncomplete",
] as const
export const costReadingLimitationSchema = z.enum(COST_READING_LIMITATIONS)
export type CostReadingLimitation = z.infer<typeof costReadingLimitationSchema>

/**
 * What a Cost reader returns for one metric on one session, in the family's native units.
 *
 * Deliberately short of a `CostMetricEvaluation`: no status and no penalty, because those come from
 * the versioned curve. A reader states what it measured and how well it could see; the artifact
 * decides what that costs.
 */
export const costMetricReadingSchema = z
  .object({
    metricId: z.string().min(1),
    family: costFamilySchema,
    rawUnit: costRawUnitSchema,
    aggregation: costAggregationModeSchema,
    applicability: costMetricApplicabilitySchema,
    readability: costMetricReadabilitySchema,
    rawValue: z.number().optional(),
    eligibleUnits: z.number().nonnegative().optional(),
    adverseUnits: z.number().nonnegative().optional(),
    observations: z.array(costSourceObservationSchema),
    evidence: costEvidenceStrengthSchema.optional(),
    nativeImpact: estimateRangeSchema.optional(),
    limitations: z.array(costReadingLimitationSchema),
  })
  .superRefine((reading, ctx) => {
    if (!isCostRawUnitOfFamily({ family: reading.family, rawUnit: reading.rawUnit })) {
      ctx.addIssue({ code: "custom", path: ["rawUnit"], message: "raw unit does not belong to the Cost family" })
    }
    const atomIds = new Set(reading.observations.map((observation) => observation.atomId))
    if (atomIds.size !== reading.observations.length) {
      ctx.addIssue({ code: "custom", path: ["observations"], message: "a source atom can be observed only once" })
    }
    if (reading.adverseUnits !== undefined && reading.adverseUnits > (reading.eligibleUnits ?? 0)) {
      ctx.addIssue({
        code: "custom",
        path: ["adverseUnits"],
        message: "adverse units cannot exceed the family's eligible units",
      })
    }
    if (reading.applicability === "notApplicable" || reading.readability === "unreadable") {
      if (reading.rawValue !== undefined) {
        ctx.addIssue({ code: "custom", path: ["rawValue"], message: "an unmeasured reading has no raw value" })
      }
      if (reading.observations.some((observation) => observation.adverseUnits > 0)) {
        ctx.addIssue({ code: "custom", path: ["observations"], message: "an unmeasured reading blames no atom" })
      }
      return
    }
    for (const field of ["rawValue", "eligibleUnits", "adverseUnits"] as const) {
      if (reading[field] === undefined) {
        ctx.addIssue({ code: "custom", path: [field], message: "a readable applicable reading must report this field" })
      }
    }
  })
export type CostMetricReading = z.infer<typeof costMetricReadingSchema>

export const sessionCostMetricEvidenceSchema = z
  .object({
    metricId: z.string().min(1),
    family: costFamilySchema,
    aggregation: costAggregationModeSchema,
    measurementState: costMetricMeasurementStateSchema,
    rawUnit: costRawUnitSchema,
    rawValue: z.number().optional(),
    eligibleUnits: z.number().nonnegative().optional(),
    adverseUnits: z.number().nonnegative().optional(),
    evidence: costEvidenceStrengthSchema.optional(),
    nativeImpact: estimateRangeSchema.optional(),
    limitations: z.array(costReadingLimitationSchema),
  })
  .superRefine((metric, ctx) => {
    if (!isCostRawUnitOfFamily({ family: metric.family, rawUnit: metric.rawUnit })) {
      ctx.addIssue({ code: "custom", path: ["rawUnit"], message: "raw unit does not belong to the Cost family" })
    }
    if (metric.adverseUnits !== undefined && metric.adverseUnits > (metric.eligibleUnits ?? 0)) {
      ctx.addIssue({ code: "custom", path: ["adverseUnits"], message: "adverse units cannot exceed eligible units" })
    }
    if (metric.measurementState !== "measured") return
    for (const field of ["rawValue", "eligibleUnits", "adverseUnits"] as const) {
      if (metric[field] === undefined) {
        ctx.addIssue({ code: "custom", path: [field], message: "measured evidence must report this field" })
      }
    }
  })
export type SessionCostMetricEvidence = z.infer<typeof sessionCostMetricEvidenceSchema>

export const toSessionCostMetricEvidence = (reading: CostMetricReading): SessionCostMetricEvidence => ({
  metricId: reading.metricId,
  family: reading.family,
  aggregation: reading.aggregation,
  measurementState: costMetricMeasurementStateOf(reading),
  rawUnit: reading.rawUnit,
  ...(reading.rawValue !== undefined ? { rawValue: reading.rawValue } : {}),
  ...(reading.eligibleUnits !== undefined ? { eligibleUnits: reading.eligibleUnits } : {}),
  ...(reading.adverseUnits !== undefined ? { adverseUnits: reading.adverseUnits } : {}),
  ...(reading.evidence !== undefined ? { evidence: reading.evidence } : {}),
  ...(reading.nativeImpact !== undefined ? { nativeImpact: reading.nativeImpact } : {}),
  limitations: [...reading.limitations],
})

export interface CostReadingBase {
  readonly metricId: string
  readonly family: CostMetricReading["family"]
  readonly rawUnit: CostMetricReading["rawUnit"]
  readonly aggregation: CostMetricReading["aggregation"]
}

/** A metric whose preconditions the session does not meet: a real result that penalizes nothing. */
export const notApplicableReading = (
  base: CostReadingBase,
  limitations: readonly CostReadingLimitation[] = [],
): CostMetricReading => ({
  ...base,
  applicability: "notApplicable",
  readability: "readable",
  observations: [],
  limitations: [...limitations],
})

/** A metric that applies but could not be read: lowers coverage, never reads as healthy. */
export const unreadableReading = (
  base: CostReadingBase,
  limitations: readonly CostReadingLimitation[],
  eligibleUnits?: number,
): CostMetricReading => ({
  ...base,
  applicability: "applicable",
  readability: "unreadable",
  ...(eligibleUnits !== undefined ? { eligibleUnits } : {}),
  observations: [],
  limitations: [...limitations],
})
