import { z } from "zod"

export const optimizationBudgetSchema = z.object({
  time: z.number().int().positive().optional(),
  tokens: z.number().int().positive().optional(),
  stagnation: z.number().int().positive().optional(),
})

export type OptimizationBudget = z.infer<typeof optimizationBudgetSchema>

export const optimizationStopReasonSchema = z.enum(["time_budget", "tokens_budget", "stagnation", "completed"])

export type OptimizationStopReason = z.infer<typeof optimizationStopReasonSchema>

export const optimizationExampleSchema = z.object({
  id: z.string().min(1),
})

export type OptimizationExample = z.infer<typeof optimizationExampleSchema>

export const optimizationDatasetSplitSchema = z.object({
  trainset: z.array(optimizationExampleSchema),
  valset: z.array(optimizationExampleSchema),
})

export type OptimizationDatasetSplit = z.infer<typeof optimizationDatasetSplitSchema>

export const optimizationCandidateSchema = z.object({
  componentId: z.string().min(1),
  text: z.string().min(1),
  hash: z.string().min(1),
})

export type OptimizationCandidate = z.infer<typeof optimizationCandidateSchema>

export const optimizationTrajectorySchema = z.object({
  id: z.string().min(1),
  conversationText: z.string().min(1),
  feedback: z.string(),
  annotationContext: z.string().optional(),
  expectedPositive: z.boolean(),
  predictedPositive: z.boolean(),
  passed: z.boolean(),
  score: z.number().min(0).max(1),
  totalTokens: z.number().int().nonnegative(),
})

export type OptimizationTrajectory = z.infer<typeof optimizationTrajectorySchema>

export const optimizationEvaluationResultSchema = z.object({
  trajectory: optimizationTrajectorySchema,
})

export type OptimizationEvaluationResult = z.infer<typeof optimizationEvaluationResultSchema>

export const optimizationResultSchema = z.object({
  optimizedCandidate: optimizationCandidateSchema,
  stopReason: optimizationStopReasonSchema.optional(),
})

export type OptimizationResult = z.infer<typeof optimizationResultSchema>
