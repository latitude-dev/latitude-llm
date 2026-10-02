import type { costScoreEvidenceSchema, ScoreEvidenceContract } from "@domain/shared"
import { z } from "zod"

export const COST_FAMILIES = ["spend", "context", "tools", "memory", "recovery"] as const
export const costFamilySchema = z.enum(COST_FAMILIES)
export type CostFamily = z.infer<typeof costFamilySchema>

export const costRawUnitSchema = z.enum([
  "microcents",
  "inputTokens",
  "cacheTokens",
  "contextLimitTokens",
  "toolCalls",
  "memoryOperations",
  "memoryReads",
  "memoryWrites",
  "completedSessions",
])
export type CostRawUnit = z.infer<typeof costRawUnitSchema>

export const COST_FAMILY_CANONICAL_UNIT = {
  spend: "microcents",
  context: "inputTokens",
  tools: "toolCalls",
  memory: "memoryOperations",
  recovery: "completedSessions",
} as const satisfies Record<CostFamily, CostRawUnit>

export const COST_FAMILY_RAW_UNITS = {
  spend: ["microcents"],
  context: ["inputTokens", "cacheTokens", "contextLimitTokens"],
  tools: ["toolCalls"],
  memory: ["memoryOperations", "memoryReads", "memoryWrites"],
  recovery: ["completedSessions"],
} as const satisfies Record<CostFamily, readonly CostRawUnit[]>

export const isCostRawUnitOfFamily = ({
  family,
  rawUnit,
}: {
  readonly family: CostFamily
  readonly rawUnit: CostRawUnit
}): boolean => COST_FAMILY_RAW_UNITS[family].some((unit) => unit === rawUnit)

export const costAggregationModeSchema = z.enum(["resourceRatio", "eventRate", "sessionMean"])
export type CostAggregationMode = z.infer<typeof costAggregationModeSchema>

export const costMetricApplicabilitySchema = z.enum(["applicable", "notApplicable"])
export type CostMetricApplicability = z.infer<typeof costMetricApplicabilitySchema>

export const costMetricReadabilitySchema = z.enum(["readable", "unreadable"])
export type CostMetricReadability = z.infer<typeof costMetricReadabilitySchema>

export const costMetricHealthSchema = z.enum(["healthy", "watch", "poor"])
export type CostMetricHealth = z.infer<typeof costMetricHealthSchema>

export const costMeasurementStatusSchema = z.enum(["healthy", "watch", "poor", "unmeasured", "notApplicable"])
export type CostMeasurementStatus = z.infer<typeof costMeasurementStatusSchema>

export const costMetricMeasurementStateSchema = z.enum(["measured", "unmeasured", "notApplicable"])
export type CostMetricMeasurementState = z.infer<typeof costMetricMeasurementStateSchema>

export const costFamilyMeasurementStateSchema = z.enum(["measured", "partial", "unmeasured", "notApplicable"])
export type CostFamilyMeasurementState = z.infer<typeof costFamilyMeasurementStateSchema>

export const unitFractionSchema = z.number().min(0).max(1)
const nonNegativeUnitsSchema = z.number().nonnegative()

export const estimateRangeInterpretationSchema = z.enum(["identificationBound", "confidenceInterval"])
export type EstimateRangeInterpretation = z.infer<typeof estimateRangeInterpretationSchema>

export const estimateRangeSchema = z
  .object({
    unit: z.string().min(1),
    point: z.number(),
    lower: z.number().optional(),
    upper: z.number().optional(),
    interpretation: estimateRangeInterpretationSchema.optional(),
  })
  .superRefine((range, ctx) => {
    if (range.lower !== undefined && range.lower > range.point) {
      ctx.addIssue({ code: "custom", path: ["lower"], message: "lower bound cannot exceed the point estimate" })
    }
    if (range.upper !== undefined && range.upper < range.point) {
      ctx.addIssue({ code: "custom", path: ["upper"], message: "upper bound cannot be below the point estimate" })
    }
    if ((range.lower !== undefined || range.upper !== undefined) && range.interpretation === undefined) {
      ctx.addIssue({ code: "custom", path: ["interpretation"], message: "a bounded range must state its meaning" })
    }
  })
export type EstimateRange = z.infer<typeof estimateRangeSchema>

export const costSourceClaimSchema = z
  .object({
    atomId: z.string().min(1),
    eligibleUnits: nonNegativeUnitsSchema,
    penalizedUnits: nonNegativeUnitsSchema,
  })
  .superRefine((claim, ctx) => {
    if (claim.penalizedUnits > claim.eligibleUnits) {
      ctx.addIssue({
        code: "custom",
        path: ["penalizedUnits"],
        message: "penalized units cannot exceed the atom's eligible units",
      })
    }
  })
export type CostSourceClaim = z.infer<typeof costSourceClaimSchema>

const costMetricEvaluationFieldsSchema = z.object({
  metricId: z.string().min(1),
  family: costFamilySchema,
  rawUnit: costRawUnitSchema,
  aggregation: costAggregationModeSchema,
  applicability: costMetricApplicabilitySchema,
  readability: costMetricReadabilitySchema,
  rawValue: z.number().optional(),
  status: costMetricHealthSchema.optional(),
  penalty: unitFractionSchema.optional(),
  eligibleUnits: nonNegativeUnitsSchema.optional(),
  penalizedUnits: nonNegativeUnitsSchema.optional(),
  sourceClaims: z.array(costSourceClaimSchema),
  nativeImpact: estimateRangeSchema.optional(),
})

const MEASURED_EVALUATION_FIELDS = ["rawValue", "status", "penalty", "eligibleUnits", "penalizedUnits"] as const

const requireAbsentFields = ({
  evaluation,
  ctx,
  fields,
  message,
}: {
  readonly evaluation: z.infer<typeof costMetricEvaluationFieldsSchema>
  readonly ctx: z.RefinementCtx
  readonly fields: readonly (typeof MEASURED_EVALUATION_FIELDS)[number][]
  readonly message: string
}): void => {
  for (const field of fields) {
    if (evaluation[field] !== undefined) ctx.addIssue({ code: "custom", path: [field], message })
  }
}

export const costMetricEvaluationSchema = costMetricEvaluationFieldsSchema.superRefine((evaluation, ctx) => {
  if (!isCostRawUnitOfFamily({ family: evaluation.family, rawUnit: evaluation.rawUnit })) {
    ctx.addIssue({ code: "custom", path: ["rawUnit"], message: "raw unit does not belong to the Cost family" })
  }
  const atomIds = new Set(evaluation.sourceClaims.map((claim) => claim.atomId))
  if (atomIds.size !== evaluation.sourceClaims.length) {
    ctx.addIssue({ code: "custom", path: ["sourceClaims"], message: "a source atom can be claimed only once" })
  }
  if (evaluation.penalizedUnits !== undefined && evaluation.penalizedUnits > (evaluation.eligibleUnits ?? 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["penalizedUnits"],
      message: "penalized units cannot exceed the family's eligible units",
    })
  }
  if (evaluation.applicability === "notApplicable") {
    requireAbsentFields({
      evaluation,
      ctx,
      fields: MEASURED_EVALUATION_FIELDS,
      message: "a not-applicable metric carries no measurement",
    })
    if (evaluation.sourceClaims.length > 0) {
      ctx.addIssue({ code: "custom", path: ["sourceClaims"], message: "a not-applicable metric claims no atoms" })
    }
    return
  }
  if (evaluation.readability === "unreadable") {
    requireAbsentFields({
      evaluation,
      ctx,
      fields: ["rawValue", "status", "penalty", "penalizedUnits"],
      message: "an unreadable metric cannot report a health result",
    })
    if (evaluation.sourceClaims.some((claim) => claim.penalizedUnits > 0)) {
      ctx.addIssue({ code: "custom", path: ["sourceClaims"], message: "an unreadable metric penalizes no atoms" })
    }
    return
  }
  for (const field of MEASURED_EVALUATION_FIELDS) {
    if (evaluation[field] === undefined) {
      ctx.addIssue({ code: "custom", path: [field], message: "a readable applicable metric must report this field" })
    }
  }
})
export type CostMetricEvaluation = z.infer<typeof costMetricEvaluationSchema>

export const sessionCostMetricEvaluationSchema = z.object({
  family: costFamilySchema,
  rawValue: z.number().optional(),
  rawUnit: costRawUnitSchema.optional(),
  measurementState: costMetricMeasurementStateSchema,
  nativeImpact: estimateRangeSchema.optional(),
})
export type SessionCostMetricEvaluation = z.infer<typeof sessionCostMetricEvaluationSchema>

export const costMeasurementStatusOf = (evaluation: CostMetricEvaluation): CostMeasurementStatus => {
  if (evaluation.applicability === "notApplicable") return "notApplicable"
  if (evaluation.readability === "unreadable") return "unmeasured"
  return evaluation.status ?? "unmeasured"
}

export const costMetricMeasurementStateOf = (
  evaluation: Pick<CostMetricEvaluation, "applicability" | "readability">,
): CostMetricMeasurementState => {
  if (evaluation.applicability === "notApplicable") return "notApplicable"
  return evaluation.readability === "unreadable" ? "unmeasured" : "measured"
}

export const toSessionCostMetricEvaluation = (evaluation: CostMetricEvaluation): SessionCostMetricEvaluation => ({
  family: evaluation.family,
  measurementState: costMetricMeasurementStateOf(evaluation),
  ...(evaluation.rawValue !== undefined ? { rawValue: evaluation.rawValue, rawUnit: evaluation.rawUnit } : {}),
  ...(evaluation.nativeImpact !== undefined ? { nativeImpact: evaluation.nativeImpact } : {}),
})

export type CostEvidenceContract = z.infer<typeof costScoreEvidenceSchema>

export const COST_ESTIMATOR_CHANNEL = {
  scoreDimension: "cost",
  role: "spendEfficiency",
} as const satisfies CostEvidenceContract

export const isCostEstimatorChannel = (evidence: ScoreEvidenceContract): evidence is CostEvidenceContract =>
  evidence.scoreDimension === COST_ESTIMATOR_CHANNEL.scoreDimension

export type CostFamilyResolution =
  | { readonly kind: "deterministicLinkage"; readonly family: CostFamily; readonly metricId: string }
  | { readonly kind: "residualSignal"; readonly family: CostFamily }
  | { readonly kind: "unresolved" }
