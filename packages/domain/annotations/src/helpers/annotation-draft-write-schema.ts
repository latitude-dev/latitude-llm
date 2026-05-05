import {
  annotationAnchorSchema,
  annotationScoreSourceIdSchema,
  baseWriteScoreInputSchema,
  scoreValueSchema,
} from "@domain/scores"
import { cuidSchema, ProjectId, sessionIdSchema, spanIdSchema, TraceId, traceIdSchema, UserId } from "@domain/shared"
import { z } from "zod"

/** Shared fields for creating or updating a human annotation draft score (before publication). */
const annotationDraftWriteCoreSchema = z.object({
  id: baseWriteScoreInputSchema.shape.id,
  projectId: cuidSchema.transform(ProjectId),
  sourceId: annotationScoreSourceIdSchema,
  sessionId: sessionIdSchema.nullable().default(null),
  traceId: traceIdSchema.transform(TraceId),
  spanId: spanIdSchema.nullable().default(null),
  simulationId: baseWriteScoreInputSchema.shape.simulationId,
  issueId: baseWriteScoreInputSchema.shape.issueId,
  annotatorId: cuidSchema.transform(UserId).nullable().default(null),
  value: scoreValueSchema,
  passed: z.boolean(),
  feedback: z.string().min(1),
})

/** Persist payload: optional nested `anchor` carrying message/part/offset indices. */
export const persistDraftAnnotationInputSchema = annotationDraftWriteCoreSchema.extend({
  anchor: annotationAnchorSchema.optional(),
})
