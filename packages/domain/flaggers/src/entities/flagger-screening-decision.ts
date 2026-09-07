import { scoringArtifactVersionSchema } from "@domain/scores"
import { organizationIdSchema, projectIdSchema, sessionIdSchema } from "@domain/shared"
import { z } from "zod"
import { FLAGGER_SCREENING_OUTCOMES, FLAGGER_SCREENING_SELECTION_REASONS } from "../constants.ts"
import { flaggerSlugSchema } from "./flagger.ts"

export const flaggerScreeningSelectionReasonSchema = z.enum(FLAGGER_SCREENING_SELECTION_REASONS)
export type FlaggerScreeningSelectionReason = z.infer<typeof flaggerScreeningSelectionReasonSchema>

export const flaggerScreeningOutcomeSchema = z.enum(FLAGGER_SCREENING_OUTCOMES)
export type FlaggerScreeningOutcome = z.infer<typeof flaggerScreeningOutcomeSchema>

export const flaggerScreeningSelectionSchema = z.object({
  decisionId: z.string().regex(/^[0-9a-f]{64}$/),
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
  flaggerSlug: flaggerSlugSchema,
  analysisHash: z.string().length(64),
  scoringArtifactVersion: scoringArtifactVersionSchema,
  selected: z.boolean(),
  reason: flaggerScreeningSelectionReasonSchema,
  inclusionProbability: z.number().min(0).max(1).optional(),
  hintKinds: z.array(z.string().min(1)).readonly(),
  retentionDays: z.number().int().positive(),
})

export type FlaggerScreeningSelection = z.infer<typeof flaggerScreeningSelectionSchema>

export const flaggerScreeningDecisionSchema = flaggerScreeningSelectionSchema.extend({
  attempt: z.number().int().positive(),
  version: z.number().int().positive(),
  outcome: flaggerScreeningOutcomeSchema.optional(),
  createdAt: z.date(),
})

export type FlaggerScreeningDecision = z.infer<typeof flaggerScreeningDecisionSchema>
