import { organizationIdSchema, projectIdSchema, sessionIdSchema } from "@domain/shared"
import { z } from "zod"
import {
  JEV_SHADOW_DECISIONS,
  JEV_SHADOW_OBSERVATION_STATUSES,
  JEV_SHADOW_PROVIDER_FAILURE_KINDS,
} from "../constants.ts"
import { flaggerScreeningDecisionSchema, flaggerScreeningSelectionReasonSchema } from "./flagger-screening-decision.ts"

export const jevShadowDecisionSchema = z.enum(JEV_SHADOW_DECISIONS)
export type JevShadowDecision = z.infer<typeof jevShadowDecisionSchema>

export const jevShadowObservationStatusSchema = z.enum(JEV_SHADOW_OBSERVATION_STATUSES)
export type JevShadowObservationStatus = z.infer<typeof jevShadowObservationStatusSchema>

export const jevShadowProviderFailureKindSchema = z.enum(JEV_SHADOW_PROVIDER_FAILURE_KINDS)
export type JevShadowObservationErrorCategory = z.infer<typeof jevShadowProviderFailureKindSchema>

const selectionFields = flaggerScreeningDecisionSchema.pick({
  decisionId: true,
  analysisHash: true,
  scoringArtifactVersion: true,
  attempt: true,
  version: true,
  reason: true,
  inclusionProbability: true,
})

export const jevShadowObservationSchema = z.object({
  observationId: z.string().regex(/^[0-9a-f]{64}$/),
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
  flaggerSlug: z.string().min(1),
  screeningDecisionId: selectionFields.shape.decisionId,
  analysisHash: selectionFields.shape.analysisHash,
  scoringArtifactVersion: selectionFields.shape.scoringArtifactVersion,
  screeningAttempt: selectionFields.shape.attempt,
  screeningVersion: selectionFields.shape.version,
  workflowId: z.string().min(1),
  workflowRunId: z.string().min(1),
  activityId: z.string().min(1),
  activityAttempt: z.number().int().positive(),
  stateHash: z.string().regex(/^[0-9a-f]{64}$/),
  stateBuilderVersion: z.string().min(1),
  stateTruncated: z.boolean(),
  provider: z.string().min(1),
  requestedModel: z.string().min(1).nullable(),
  resolvedModel: z.string().min(1).nullable(),
  questionVersion: z.string().min(1),
  policyVersion: z.string().min(1),
  threshold: z.number().min(0).max(1),
  probability: z.number().min(0).max(1).nullable(),
  advisoryDecision: jevShadowDecisionSchema,
  status: jevShadowObservationStatusSchema,
  errorCategory: jevShadowProviderFailureKindSchema.nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  selectionReason: flaggerScreeningSelectionReasonSchema,
  selectionProbability: selectionFields.shape.inclusionProbability.nullable(),
  observedAt: z.date(),
  retentionDays: z.number().int().positive(),
})

export type JevShadowObservation = z.infer<typeof jevShadowObservationSchema>
