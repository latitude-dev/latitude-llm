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

/** HTTP / UI input: optional structured anchor. */
export const annotationDraftWriteInputSchema = annotationDraftWriteCoreSchema.extend({
  anchor: annotationAnchorSchema.optional(),
})

const persistDraftAnnotationAnchorFlatSchema = z.object({
  messageIndex: z.number().int().min(0).optional(),
  partIndex: z.number().int().min(0).optional(),
  startOffset: z.number().int().min(0).optional(),
  endOffset: z.number().int().min(0).optional(),
})

/** Persist payload: optional `anchor` (UI) or flat indices (programmatic callers). */
export const persistDraftAnnotationInputSchema = annotationDraftWriteCoreSchema
  .merge(persistDraftAnnotationAnchorFlatSchema)
  .extend({
    anchor: annotationAnchorSchema.optional(),
  })

type PersistDraftAnnotationParsedBody = z.output<typeof persistDraftAnnotationInputSchema>

export const anchorFromPersistDraftFlatFields = (
  parsed: Pick<PersistDraftAnnotationParsedBody, "messageIndex" | "partIndex" | "startOffset" | "endOffset">,
): z.infer<typeof annotationAnchorSchema> | undefined =>
  parsed.messageIndex !== undefined
    ? {
        messageIndex: parsed.messageIndex,
        partIndex: parsed.partIndex,
        startOffset: parsed.startOffset,
        endOffset: parsed.endOffset,
      }
    : undefined
