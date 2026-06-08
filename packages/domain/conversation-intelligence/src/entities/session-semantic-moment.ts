import { organizationIdSchema, projectIdSchema, sessionIdSchema, traceIdSchema } from "@domain/shared"
import { z } from "zod"
import { SEMANTIC_MOMENT_BOUNDARY_REASONS } from "../constants.ts"

export const semanticMomentBoundaryReasonSchema = z.enum(SEMANTIC_MOMENT_BOUNDARY_REASONS)
export type SemanticMomentBoundaryReason = z.infer<typeof semanticMomentBoundaryReasonSchema>

export const SemanticMomentBoundaryReason = {
  SessionStart: "session_start",
  SemanticDrift: "semantic_drift",
  MaxLength: "max_length",
  RoleBoundary: "role_boundary",
  TopicDrift: "topic_drift",
  SessionEnd: "session_end",
} as const satisfies Record<string, SemanticMomentBoundaryReason>

export const sessionSemanticMomentSchema = z.object({
  organizationId: organizationIdSchema,
  projectId: projectIdSchema,
  sessionId: sessionIdSchema,
  analysisHash: z.string().length(64),
  momentId: z.string().min(1),
  traceId: traceIdSchema,
  startTime: z.date(),
  endTime: z.date(),
  firstMessageIndex: z.number().int().nonnegative(),
  lastMessageIndex: z.number().int().nonnegative(),
  boundaryReason: semanticMomentBoundaryReasonSchema,
  embedding: z.array(z.number()),
  coherenceScore: z.number().min(0).max(1),
  retentionDays: z.number().int().positive(),
  indexedAt: z.date(),
})

export type SessionSemanticMoment = z.infer<typeof sessionSemanticMomentSchema>
