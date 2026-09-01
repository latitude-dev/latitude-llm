import { z } from "zod"

export const SCORE_DIMENSIONS = ["outcome", "reliability", "cost", "speed", "safety"] as const
export const scoreDimensionSchema = z.enum(SCORE_DIMENSIONS)
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>

export const outcomeScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("outcome"),
  role: z.literal("taskOutcome"),
})
export const reliabilityScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("reliability"),
  role: z.enum(["completionOutcome", "operationalIncident"]),
})
export const costScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("cost"),
  role: z.literal("spendEfficiency"),
})
export const speedScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("speed"),
  role: z.literal("criticalPathEfficiency"),
})
export const safetyScoreEvidenceSchema = z.object({
  scoreDimension: z.literal("safety"),
  role: z.enum(["confirmedHarm", "exposure", "successfulDefense"]),
})

export const scoreEvidenceContractSchema = z.discriminatedUnion("scoreDimension", [
  outcomeScoreEvidenceSchema,
  reliabilityScoreEvidenceSchema,
  costScoreEvidenceSchema,
  speedScoreEvidenceSchema,
  safetyScoreEvidenceSchema,
])
export type ScoreEvidenceContract = z.infer<typeof scoreEvidenceContractSchema>
