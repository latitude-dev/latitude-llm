import { buildJudgmentVersion, safetyJudgmentVersion, taskOutcomeJudgmentVersion } from "@domain/flaggers"
import { SCORE_DIMENSIONS, type ScoreDimension, scoreDimensionSchema } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { InvalidAgentScoreArtifactError } from "../errors.ts"
import { unitFractionSchema } from "./cost-evidence.ts"

const COMPOSITE_WEIGHT_SUM_TOLERANCE = 1e-9

/**
 * How many eligible sessions each window step must reach, and when the step may change.
 *
 * Part of the artifact because a changed window changes what the score is a summary of, which
 * `score.md` lists as a scoring-version boundary. The hysteresis margin belongs with the steps for
 * the same reason: it decides which step a project sits on.
 */
export const scoreWindowSettingsSchema = z
  .object({
    stepDays: z.array(z.number().int().positive()).min(1),
    sessionTarget: z.number().int().positive(),
    sessionFloor: z.number().int().positive(),
    hysteresisMargin: unitFractionSchema,
  })
  .superRefine((settings, ctx) => {
    const ascending = settings.stepDays.every(
      (days, index) => index === 0 || days > (settings.stepDays[index - 1] as number),
    )
    if (!ascending) {
      ctx.addIssue({ code: "custom", path: ["stepDays"], message: "window steps must strictly ascend" })
    }
    if (settings.sessionFloor > settings.sessionTarget) {
      ctx.addIssue({
        code: "custom",
        path: ["sessionFloor"],
        message: "the floor cannot exceed the target",
      })
    }
  })
export type ScoreWindowSettings = z.infer<typeof scoreWindowSettingsSchema>

export const outcomeCoverageFloorsSchema = z.object({
  /** Compatible sampled verdicts required before the rate means anything. */
  examinedSessions: z.number().int().nonnegative(),
  /** Share of the eligible base the examined population must describe. */
  examinedShareOfEligible: unitFractionSchema,
})
export type OutcomeCoverageFloors = z.infer<typeof outcomeCoverageFloorsSchema>

export const reliabilityCoverageFloorsSchema = z.object({
  /** Sessions whose output and error telemetry can decide operational success. */
  readableSessions: z.number().int().nonnegative(),
  readableShareOfEligible: unitFractionSchema,
})
export type ReliabilityCoverageFloors = z.infer<typeof reliabilityCoverageFloorsSchema>

export const safetyCoverageFloorsSchema = z.object({
  examinedSessions: z.number().int().nonnegative(),
  examinedShareOfEligible: unitFractionSchema,
  /**
   * How much of the hinted stratum may be lost to rate limiting before the missingness stops being
   * ignorable. Hinted Safety sessions are the ones most likely to contain harm, so dropping them
   * biases the rate downward.
   */
  maxRateLimitedHintedShare: unitFractionSchema,
})
export type SafetyCoverageFloors = z.infer<typeof safetyCoverageFloorsSchema>

export const speedCoverageFloorsSchema = z.object({
  /** Sessions whose critical path reconstructed completely; the others are not in either side of the ratio. */
  completeCriticalPathSessions: z.number().int().nonnegative(),
  completeCriticalPathShareOfEligible: unitFractionSchema,
})
export type SpeedCoverageFloors = z.infer<typeof speedCoverageFloorsSchema>

export const costCoverageFloorsSchema = z.object({
  /**
   * Share of the window's sessions whose required Cost families were readable. Below it Cost is
   * withheld rather than pooled over the sessions that happened to be readable, because a smaller
   * denominator reads as healthy.
   */
  publishableSessionShare: unitFractionSchema,
})
export type CostCoverageFloors = z.infer<typeof costCoverageFloorsSchema>

export const dimensionCoverageFloorsSchema = z.object({
  outcome: outcomeCoverageFloorsSchema,
  reliability: reliabilityCoverageFloorsSchema,
  cost: costCoverageFloorsSchema,
  speed: speedCoverageFloorsSchema,
  safety: safetyCoverageFloorsSchema,
})
export type DimensionCoverageFloors = z.infer<typeof dimensionCoverageFloorsSchema>

/**
 * The judge identities each sampled reader may pool under this scoring version.
 *
 * A verdict whose stored version is absent here is excluded as a coverage limitation rather than
 * silently averaged with another judge's answers.
 */
export const supportedJudgmentVersionsSchema = z.object({
  taskOutcome: z.array(z.string().min(1)).min(1),
  safety: z.array(z.string().min(1)).min(1),
})
export type SupportedJudgmentVersions = z.infer<typeof supportedJudgmentVersionsSchema>

/**
 * An optional product rule that caps the composite when harm was confirmed.
 *
 * Stored and reported separately from the weighted mean so the page attributes the lost points to
 * the rule rather than to a metric or a signal.
 */
export const compositePolicyCapSchema = z.object({
  maxCompositeWithConfirmedHarm: z.number().min(0).max(100),
})
export type CompositePolicyCap = z.infer<typeof compositePolicyCapSchema>

export const agentScoreArtifactSchema = z
  .object({
    scoringVersion: z.string().min(1),
    calibration: z.enum(["provisional", "calibrated"]),
    compositeWeights: z.record(scoreDimensionSchema, z.number().nonnegative()),
    referenceRuns: z.object({
      reliability: z.number().int().positive(),
      safety: z.number().int().positive(),
    }),
    window: scoreWindowSettingsSchema,
    dimensionFloors: dimensionCoverageFloorsSchema,
    costArtifactVersion: z.string().min(1),
    costCatalogVersion: z.string().min(1),
    latencyArtifactVersion: z.string().min(1),
    supportedJudgmentVersions: supportedJudgmentVersionsSchema,
    policyCap: compositePolicyCapSchema.optional(),
  })
  .superRefine((artifact, ctx) => {
    const weightSum = SCORE_DIMENSIONS.reduce((total, dimension) => total + artifact.compositeWeights[dimension], 0)
    if (Math.abs(weightSum - 1) > COMPOSITE_WEIGHT_SUM_TOLERANCE) {
      ctx.addIssue({ code: "custom", path: ["compositeWeights"], message: "composite weights must sum to one" })
    }
  })
export type AgentScoreArtifact = z.infer<typeof agentScoreArtifactSchema>

export const compositeWeightOf = (artifact: AgentScoreArtifact, dimension: ScoreDimension): number =>
  artifact.compositeWeights[dimension]

export const loadAgentScoreArtifact = (
  artifact: unknown,
): Effect.Effect<AgentScoreArtifact, InvalidAgentScoreArtifactError> => {
  const parsed = agentScoreArtifactSchema.safeParse(artifact)
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(
        new InvalidAgentScoreArtifactError({
          issues: parsed.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`),
        }),
      )
}

export interface ScoringJudge {
  readonly provider: string
  readonly model: string
}

export interface ResolvedScoringVersion {
  readonly scoringVersion: string
  /** `local` when the deployment resolved a judge the bundled artifact does not list. */
  readonly origin: "bundled" | "local"
  readonly supportedJudgmentVersions: SupportedJudgmentVersions
}

export const LOCAL_SCORING_VERSION_PREFIX = "local"

/**
 * The scoring version this deployment actually runs under.
 *
 * Hosted and self-hosted load the same formulas and the same artifacts; only the judge can differ.
 * A deployment pointing its classifier at another model forms its own population rather than
 * pooling two judges under one label, so it runs under a derived local version whose supported list
 * contains exactly the judge it resolved. Publication still requires that judge's verdicts to pass
 * the same floors, so this widens nothing: it only stops one deployment's numbers being presented as
 * comparable with another's.
 */
export const resolveScoringVersion = ({
  artifact,
  judge,
}: {
  readonly artifact: AgentScoreArtifact
  readonly judge: ScoringJudge
}): ResolvedScoringVersion => {
  const taskOutcome = taskOutcomeJudgmentVersion(judge)
  const safety = safetyJudgmentVersion(judge)
  const bundled =
    artifact.supportedJudgmentVersions.taskOutcome.includes(taskOutcome) &&
    artifact.supportedJudgmentVersions.safety.includes(safety)

  if (bundled) {
    return {
      scoringVersion: artifact.scoringVersion,
      origin: "bundled",
      supportedJudgmentVersions: artifact.supportedJudgmentVersions,
    }
  }

  return {
    scoringVersion: buildJudgmentVersion(`${artifact.scoringVersion}+${LOCAL_SCORING_VERSION_PREFIX}`, judge),
    origin: "local",
    supportedJudgmentVersions: { taskOutcome: [taskOutcome], safety: [safety] },
  }
}
