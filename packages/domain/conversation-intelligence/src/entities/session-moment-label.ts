import { organizationIdSchema, projectIdSchema, sessionIdSchema } from "@domain/shared"
import { z } from "zod"
import { MOMENT_ACTORS, MOMENT_KINDS } from "../constants.ts"

export const momentLabelKindSchema = z.enum(MOMENT_KINDS)
export type MomentLabelKind = z.infer<typeof momentLabelKindSchema>

export const momentLabelActorSchema = z.enum(MOMENT_ACTORS)
export type MomentLabelActor = z.infer<typeof momentLabelActorSchema>

export const sessionMomentLabelSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
  analysisHash: z.string().length(64),
  labelId: z.string().min(1),
  momentId: z.string().min(1),
  kind: momentLabelKindSchema,
  actor: momentLabelActorSchema,
  firstMessageIndex: z.number().int().nonnegative(),
  lastMessageIndex: z.number().int().nonnegative(),
  summary: z.string(),
  evidence: z.string().min(1),
  confidence: z.number().min(0).max(1),
  retentionDays: z.number().int().positive(),
  indexedAt: z.date(),
})

export type SessionMomentLabel = z.infer<typeof sessionMomentLabelSchema>
