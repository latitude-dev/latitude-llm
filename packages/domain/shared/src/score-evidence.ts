import { z } from "zod"

export const SCORE_DIMENSIONS = ["outcome", "reliability", "cost", "speed", "safety"] as const
export const scoreDimensionSchema = z.enum(SCORE_DIMENSIONS)
export type ScoreDimension = z.infer<typeof scoreDimensionSchema>

export const scoreEvidenceContractSchema = z.discriminatedUnion("scoreDimension", [
  z.object({ scoreDimension: z.literal("outcome"), role: z.literal("taskOutcome") }),
  z.object({
    scoreDimension: z.literal("reliability"),
    role: z.enum(["completionOutcome", "operationalIncident"]),
  }),
  z.object({ scoreDimension: z.literal("cost"), role: z.literal("spendEfficiency") }),
  z.object({ scoreDimension: z.literal("speed"), role: z.literal("criticalPathEfficiency") }),
  z.object({
    scoreDimension: z.literal("safety"),
    role: z.enum(["confirmedHarm", "exposure", "successfulDefense"]),
  }),
])
export type ScoreEvidenceContract = z.infer<typeof scoreEvidenceContractSchema>
