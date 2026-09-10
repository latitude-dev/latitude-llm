import { Effect } from "effect"
import { z } from "zod"
import { InvalidCostMetricCatalogError, InvalidCostScoringArtifactError } from "../errors.ts"
import { COST_FAMILIES, costFamilySchema, unitFractionSchema } from "./cost-evidence.ts"
import { type CostMetricCatalog, costMetricCatalogSchema } from "./cost-metric-catalog.ts"

const FAMILY_WEIGHT_SUM_TOLERANCE = 1e-9

export const costCurvePointSchema = z.object({
  rawValue: z.number().nonnegative(),
  penalty: unitFractionSchema,
})
export type CostCurvePoint = z.infer<typeof costCurvePointSchema>

const costMetricCurveFieldsSchema = z.object({
  curveId: z.string().min(1),
  points: z.array(costCurvePointSchema).min(2),
  healthyMaxRawValue: z.number().nonnegative(),
  watchMaxRawValue: z.number().nonnegative(),
})

const penaltyAtPoint = ({
  points,
  rawValue,
}: {
  readonly points: readonly CostCurvePoint[]
  readonly rawValue: number
}): number | undefined => points.find((point) => point.rawValue === rawValue)?.penalty

const validateCurveShape = (curve: z.infer<typeof costMetricCurveFieldsSchema>, ctx: z.RefinementCtx): void => {
  const [first, ...rest] = curve.points
  if (first && (first.rawValue !== 0 || first.penalty !== 0)) {
    ctx.addIssue({ code: "custom", path: ["points", 0], message: "a curve must start at a zero-penalty zero share" })
  }
  let previous = first
  for (const [index, point] of rest.entries()) {
    if (!previous) break
    if (point.rawValue <= previous.rawValue) {
      ctx.addIssue({ code: "custom", path: ["points", index + 1], message: "raw values must strictly ascend" })
    }
    if (point.penalty < previous.penalty) {
      ctx.addIssue({ code: "custom", path: ["points", index + 1], message: "penalties must not decrease" })
    }
    previous = point
  }
}

const validateCurveBoundaries = (curve: z.infer<typeof costMetricCurveFieldsSchema>, ctx: z.RefinementCtx): void => {
  const healthyPenalty = penaltyAtPoint({ points: curve.points, rawValue: curve.healthyMaxRawValue })
  const watchPenalty = penaltyAtPoint({ points: curve.points, rawValue: curve.watchMaxRawValue })
  if (curve.healthyMaxRawValue >= curve.watchMaxRawValue) {
    ctx.addIssue({
      code: "custom",
      path: ["watchMaxRawValue"],
      message: "the watch range must end above the healthy range",
    })
  }
  if (healthyPenalty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["healthyMaxRawValue"],
      message: "the healthy boundary must be one of the curve points",
    })
  } else if (healthyPenalty !== 0) {
    ctx.addIssue({ code: "custom", path: ["healthyMaxRawValue"], message: "healthy values carry no penalty" })
  }
  if (watchPenalty === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["watchMaxRawValue"],
      message: "the watch boundary must be one of the curve points",
    })
  } else if (watchPenalty <= 0) {
    ctx.addIssue({ code: "custom", path: ["watchMaxRawValue"], message: "watch values carry a penalty" })
  }
}

export const costMetricCurveSchema = costMetricCurveFieldsSchema.superRefine((curve, ctx) => {
  validateCurveShape(curve, ctx)
  validateCurveBoundaries(curve, ctx)
})
export type CostMetricCurve = z.infer<typeof costMetricCurveSchema>

export const costOverlapPolicySchema = z
  .object({
    overlapGroupId: z.string().min(1),
    resolution: z.enum(["exactFirst", "maximum", "union", "combinedCap"]),
    metricIds: z.array(z.string().min(1)),
    overlapGroups: z.array(z.string().min(1)),
    families: z.array(costFamilySchema).min(1),
    combinedCap: unitFractionSchema.optional(),
  })
  .superRefine((policy, ctx) => {
    if (policy.metricIds.length + policy.overlapGroups.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["metricIds"],
        message: "an overlap policy must reference at least one metric or overlap group",
      })
    }
    if (new Set(policy.metricIds).size !== policy.metricIds.length) {
      ctx.addIssue({ code: "custom", path: ["metricIds"], message: "referenced metrics must be unique" })
    }
    if (new Set(policy.overlapGroups).size !== policy.overlapGroups.length) {
      ctx.addIssue({ code: "custom", path: ["overlapGroups"], message: "referenced overlap groups must be unique" })
    }
    if (new Set(policy.families).size !== policy.families.length) {
      ctx.addIssue({ code: "custom", path: ["families"], message: "referenced families must be unique" })
    }
    if ((policy.resolution === "combinedCap") !== (policy.combinedCap !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["combinedCap"],
        message: "a combined cap belongs to the combinedCap resolution and nowhere else",
      })
    }
    if (policy.families.length > 1 && policy.resolution !== "combinedCap") {
      ctx.addIssue({
        code: "custom",
        path: ["resolution"],
        message: "a cross-family policy must declare a combined cap",
      })
    }
  })
export type CostOverlapPolicy = z.infer<typeof costOverlapPolicySchema>

export const costFamilyCoverageRequirementSchema = z.object({
  required: z.boolean(),
  coverageFloor: unitFractionSchema,
})
export type CostFamilyCoverageRequirement = z.infer<typeof costFamilyCoverageRequirementSchema>

export const costTokenizerPolicySchema = z.object({
  preferProviderTokenizer: z.boolean(),
  fallbackEncoding: z.enum(["o200k_base"]),
  fallbackRelativeBound: unitFractionSchema,
})
export type CostTokenizerPolicy = z.infer<typeof costTokenizerPolicySchema>

export const costScoringArtifactSchema = z
  .object({
    artifactVersion: z.string().min(1),
    calibration: z.enum(["provisional", "calibrated"]),
    familyWeights: z.record(costFamilySchema, z.number().nonnegative()),
    metricCurves: z.array(costMetricCurveSchema).min(1),
    metricCaps: z.record(z.string().min(1), unitFractionSchema),
    familyCaps: z.record(costFamilySchema, unitFractionSchema),
    familyCoverageRequirements: z.record(costFamilySchema, costFamilyCoverageRequirementSchema),
    overlapPolicies: z.array(costOverlapPolicySchema),
    residualSignalCap: unitFractionSchema,
    tokenizerPolicy: costTokenizerPolicySchema,
  })
  .superRefine((artifact, ctx) => {
    const weightSum = COST_FAMILIES.reduce((total, family) => total + artifact.familyWeights[family], 0)
    if (Math.abs(weightSum - 1) > FAMILY_WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({ code: "custom", path: ["familyWeights"], message: "family weights must sum to one" })
    }
    const curveIds = new Set(artifact.metricCurves.map((curve) => curve.curveId))
    if (curveIds.size !== artifact.metricCurves.length) {
      ctx.addIssue({ code: "custom", path: ["metricCurves"], message: "curve ids must be unique" })
    }
    const policyIds = new Set(artifact.overlapPolicies.map((policy) => policy.overlapGroupId))
    if (policyIds.size !== artifact.overlapPolicies.length) {
      ctx.addIssue({ code: "custom", path: ["overlapPolicies"], message: "overlap policy ids must be unique" })
    }
  })
export type CostScoringArtifact = z.infer<typeof costScoringArtifactSchema>

const issueMessages = (error: z.ZodError): string[] =>
  error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)

export const loadCostMetricCatalog = (
  catalog: unknown,
): Effect.Effect<CostMetricCatalog, InvalidCostMetricCatalogError> => {
  const parsed = costMetricCatalogSchema.safeParse(catalog)
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(new InvalidCostMetricCatalogError({ issues: issueMessages(parsed.error) }))
}

const catalogReferenceIssues = ({
  artifact,
  catalog,
}: {
  readonly artifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
}): string[] => {
  const curveIds = new Set(artifact.metricCurves.map((curve) => curve.curveId))
  const metricIds = new Set(catalog.entries.map((entry) => entry.metricId))
  return [
    ...catalog.entries.flatMap((entry) =>
      curveIds.has(entry.curveId) ? [] : [`metricCurves: ${entry.metricId} references unknown curve`],
    ),
    ...catalog.entries.flatMap((entry) =>
      artifact.metricCaps[entry.metricId] === undefined ? [`metricCaps: ${entry.metricId} has no cap`] : [],
    ),
    ...Object.keys(artifact.metricCaps).flatMap((metricId) =>
      metricIds.has(metricId) ? [] : [`metricCaps: ${metricId} is not a catalog metric`],
    ),
  ]
}

const overlapPolicyReferenceIssues = ({
  artifact,
  catalog,
}: {
  readonly artifact: CostScoringArtifact
  readonly catalog: CostMetricCatalog
}): string[] => {
  const metricIds = new Set(catalog.entries.map((entry) => entry.metricId))
  const overlapGroups = new Set(catalog.entries.map((entry) => entry.overlapGroup))
  return artifact.overlapPolicies.flatMap((policy) => [
    ...policy.metricIds.flatMap((metricId) =>
      metricIds.has(metricId) ? [] : [`overlapPolicies.${policy.overlapGroupId}: ${metricId} is not a catalog metric`],
    ),
    ...policy.overlapGroups.flatMap((group) =>
      overlapGroups.has(group)
        ? []
        : [`overlapPolicies.${policy.overlapGroupId}: ${group} is not a catalog overlap group`],
    ),
  ])
}

export const loadCostScoringArtifact = ({
  artifact,
  catalog,
}: {
  readonly artifact: unknown
  readonly catalog: CostMetricCatalog
}): Effect.Effect<CostScoringArtifact, InvalidCostScoringArtifactError> => {
  const parsed = costScoringArtifactSchema.safeParse(artifact)
  if (!parsed.success) {
    return Effect.fail(new InvalidCostScoringArtifactError({ issues: issueMessages(parsed.error) }))
  }
  const issues = [
    ...catalogReferenceIssues({ artifact: parsed.data, catalog }),
    ...overlapPolicyReferenceIssues({ artifact: parsed.data, catalog }),
  ]
  return issues.length === 0
    ? Effect.succeed(parsed.data)
    : Effect.fail(new InvalidCostScoringArtifactError({ artifactVersion: parsed.data.artifactVersion, issues }))
}
