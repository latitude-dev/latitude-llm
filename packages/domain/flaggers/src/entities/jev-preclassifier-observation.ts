import { organizationIdSchema, projectIdSchema, sessionIdSchema } from "@domain/shared"
import { z } from "zod"
import { JEV_PRECLASSIFIER_DECISIONS, JEV_SHADOW_PROVIDER_FAILURE_KINDS } from "../constants.ts"
import { flaggerScreeningSelectionReasonSchema } from "./flagger-screening-decision.ts"

export const jevPreclassifierDecisionSchema = z.enum(JEV_PRECLASSIFIER_DECISIONS)
export const jevPreclassifierObservationSchema = z.object({
  observationId: z.string().regex(/^[0-9a-f]{64}$/),
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
  flaggerSlug: z.string().min(1),
  screeningDecisionId: z.string().regex(/^[0-9a-f]{64}$/),
  analysisHash: z.string().length(64),
  workflowId: z.string().min(1),
  workflowRunId: z.string().min(1),
  activityId: z.string().min(1),
  activityAttempt: z.number().int().positive(),
  stateHash: z.string().regex(/^[0-9a-f]{64}$/),
  stateBuilderVersion: z.string().min(1),
  provider: z.string().min(1),
  requestedModel: z.string().min(1).nullable(),
  resolvedModel: z.string().min(1).nullable(),
  questionVersion: z.string().min(1),
  policyVersion: z.string().min(1),
  threshold: z.number().min(0).max(1),
  probability: z.number().min(0).max(1).nullable(),
  decision: jevPreclassifierDecisionSchema,
  errorCategory: z.enum(JEV_SHADOW_PROVIDER_FAILURE_KINDS).nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  classifyAdded: z.boolean(),
  selectionReason: flaggerScreeningSelectionReasonSchema,
  observedAt: z.date(),
  retentionDays: z.number().int().positive(),
})

export type JevPreclassifierDecision = z.infer<typeof jevPreclassifierDecisionSchema>
export type JevPreclassifierObservation = z.infer<typeof jevPreclassifierObservationSchema>
