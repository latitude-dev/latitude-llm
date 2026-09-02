import { z } from "zod"

export const SCORE_DIMENSIONS = ["outcome", "reliability", "cost", "speed", "safety"] as const
export const scoreDimensionSchema = z.enum(SCORE_DIMENSIONS)
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>

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
