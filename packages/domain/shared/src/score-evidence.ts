import { z } from "zod"

export const SCORE_DIMENSIONS = ["outcome", "reliability", "cost", "speed", "safety"] as const
export const scoreDimensionSchema = z.enum(SCORE_DIMENSIONS)
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>

/** What a dimension is called wherever a reader sees one: the score page, the digest email, Slack. */
export const SCORE_DIMENSION_LABELS: Record<ScoreDimension, string> = {
  outcome: "Outcome quality",
  reliability: "Reliability",
  cost: "Cost",
  speed: "Speed",
  safety: "Safety",
}

/** One-line description of what a dimension asks, shown beside its score. */
export const SCORE_DIMENSION_DESCRIPTIONS: Record<ScoreDimension, string> = {
  outcome: "Did users get what they came for?",
  reliability: "Can the agent complete sessions without terminal failures?",
  cost: "Does the agent use model spend and context efficiently?",
  speed: "How quickly does the agent complete user-visible work?",
  safety: "Does the agent avoid causing harm?",
}

export type ScoreBand = "low" | "medium" | "high" | "unknown"

/**
 * The band a score falls in. The thresholds are shared rather than repeated because the score page,
 * the digest email, the Slack message and the server-rendered ring all colour by them, and a score
 * that reads amber in one surface and green in another is worse than no colour at all.
 */
export const scoreBandOf = (score: number | null): ScoreBand => {
  if (score === null) return "unknown"
  if (score < 60) return "low"
  if (score < 80) return "medium"
  return "high"
}

/**
 * Light-theme hex for each band, resolved from the `--viz-*` design tokens the score page renders
 * with. Concrete values because email, Slack and the PNG renderer have no CSS variables to read.
 */
export const SCORE_BAND_COLORS: Record<ScoreBand, string> = {
  low: "#DA8072",
  medium: "#EB9737",
  high: "#62BC8C",
  unknown: "#66727F",
}

export const scoreBandColor = (score: number | null): string => SCORE_BAND_COLORS[scoreBandOf(score)]

const scoreDimensionDescription = "Agent Score dimension this evidence informs."
const evidenceRoleDescription = "How this evidence informs the dimension."

export const outcomeScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("outcome").describe(scoreDimensionDescription),
  role: z.literal("taskOutcome").describe(evidenceRoleDescription),
})
export const reliabilityScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("reliability").describe(scoreDimensionDescription),
  role: z.enum(["completionOutcome", "operationalIncident"]).describe(evidenceRoleDescription),
})
export const costScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("cost").describe(scoreDimensionDescription),
  role: z.literal("spendEfficiency").describe(evidenceRoleDescription),
})
export const speedScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("speed").describe(scoreDimensionDescription),
  role: z.literal("criticalPathEfficiency").describe(evidenceRoleDescription),
})
export const safetyScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("safety").describe(scoreDimensionDescription),
  role: z.enum(["confirmedHarm", "exposure", "successfulDefense"]).describe(evidenceRoleDescription),
})

export const scoreEvidenceContractSchema = z.discriminatedUnion("scoreDimension", [
  outcomeScoreEvidenceSchema,
  reliabilityScoreEvidenceSchema,
  costScoreEvidenceSchema,
  speedScoreEvidenceSchema,
  safetyScoreEvidenceSchema,
])
export type ScoreEvidenceContract = z.infer<typeof scoreEvidenceContractSchema>
