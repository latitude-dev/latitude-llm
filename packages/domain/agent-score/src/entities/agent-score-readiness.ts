import { scoreDimensionSchema } from "@domain/shared"
import { z } from "zod"
import { COST_FAMILIES } from "./cost-evidence.ts"

/**
 * `outcomeCoverage` and `safetyCoverage` are no longer emitted.
 *
 * They required the examined population to be a share of eligible traffic, which a count-targeted
 * sampler cannot reach on a large project. They stay in the list so readiness stored under an
 * earlier scoring version still parses; nothing produces them.
 */
export const AGENT_SCORE_THRESHOLD_METRICS = [
  "eligibleSessions",
  "outcomeEvaluations",
  "outcomeCoverage",
  "reliabilityReadableSessions",
  "reliabilityCoverage",
  "costReadableSessions",
  "costCoverage",
  "costFamilyCoverage",
  "speedCompleteSessions",
  "speedCoverage",
  "safetyEvaluations",
  "safetyCoverage",
  "safetyRateLimitedCoverage",
  "safetyIncompatibleEvaluations",
] as const

export const AGENT_SCORE_AVAILABILITY_METRICS = ["speedObservedTime"] as const

export const agentScoreThresholdRequirementSchema = z.object({
  kind: z.literal("threshold"),
  metric: z.enum(AGENT_SCORE_THRESHOLD_METRICS),
  current: z.number().nonnegative(),
  required: z.number().nonnegative(),
  comparison: z.enum(["atLeast", "atMost"]),
  unit: z.enum(["sessions", "fraction"]),
  met: z.boolean(),
  subject: z.enum(COST_FAMILIES).optional(),
})
export type AgentScoreThresholdRequirement = z.infer<typeof agentScoreThresholdRequirementSchema>

export const agentScoreAvailabilityRequirementSchema = z.object({
  kind: z.literal("availability"),
  metric: z.enum(AGENT_SCORE_AVAILABILITY_METRICS),
  met: z.boolean(),
})
export type AgentScoreAvailabilityRequirement = z.infer<typeof agentScoreAvailabilityRequirementSchema>

export const agentScoreRequirementSchema = z.discriminatedUnion("kind", [
  agentScoreThresholdRequirementSchema,
  agentScoreAvailabilityRequirementSchema,
])
export type AgentScoreRequirement = z.infer<typeof agentScoreRequirementSchema>

export const agentScoreDimensionReadinessSchema = z.object({
  scoreDimension: scoreDimensionSchema,
  requirements: z.array(agentScoreRequirementSchema).readonly(),
})
export type AgentScoreDimensionReadiness = z.infer<typeof agentScoreDimensionReadinessSchema>

export const agentScoreReadinessSchema = z.object({
  sessionRequirement: agentScoreThresholdRequirementSchema,
  dimensions: z.array(agentScoreDimensionReadinessSchema).readonly(),
})
export type AgentScoreReadiness = z.infer<typeof agentScoreReadinessSchema>
