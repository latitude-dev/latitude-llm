import {
  type AnnotationScore,
  type AnnotationScoreMetadata,
  annotationScoreSourceIdSchema,
  baseWriteScoreInputSchema,
  type ScoreDraftClosedError,
  type ScoreDraftUpdateConflictError,
  scoreValueSchema,
  writeScoreUseCase,
} from "@domain/scores"
import {
  type BadRequestError,
  cuidSchema,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  TraceId,
  UserId,
} from "@domain/shared"
import { sessionIdSchema, spanIdSchema, traceIdSchema } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { resolveWriteAnnotationTraceContext } from "../helpers/resolve-write-annotation-trace-context.ts"

const persistDraftAnnotationInputSchemaInternal = z.object({
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
  messageIndex: z.number().int().min(0).optional(),
  partIndex: z.number().int().min(0).optional(),
  startOffset: z.number().int().min(0).optional(),
  endOffset: z.number().int().min(0).optional(),
})

export const persistDraftAnnotationInputSchema = persistDraftAnnotationInputSchemaInternal

export type PersistDraftAnnotationInput = z.input<typeof persistDraftAnnotationInputSchemaInternal>

export type PersistDraftAnnotationError =
  | RepositoryError
  | BadRequestError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

export const persistDraftAnnotation = (input: PersistDraftAnnotationInput & { organizationId: string }) =>
  Effect.gen(function* () {
    const parsed = persistDraftAnnotationInputSchemaInternal.parse(input)

    const { sessionId, spanId } = yield* resolveWriteAnnotationTraceContext({
      organizationId: OrganizationId(input.organizationId),
      projectId: parsed.projectId,
      traceId: parsed.traceId,
      sessionId: parsed.sessionId,
      spanId: parsed.spanId,
      anchor:
        parsed.messageIndex !== undefined
          ? {
              messageIndex: parsed.messageIndex,
              partIndex: parsed.partIndex,
              startOffset: parsed.startOffset,
              endOffset: parsed.endOffset,
            }
          : undefined,
    })

    const metadata: AnnotationScoreMetadata = {
      rawFeedback: parsed.feedback,
      ...(parsed.messageIndex !== undefined ? { messageIndex: parsed.messageIndex } : {}),
      ...(parsed.partIndex !== undefined ? { partIndex: parsed.partIndex } : {}),
      ...(parsed.startOffset !== undefined ? { startOffset: parsed.startOffset } : {}),
      ...(parsed.endOffset !== undefined ? { endOffset: parsed.endOffset } : {}),
    }

    const score = yield* writeScoreUseCase({
      id: parsed.id,
      projectId: parsed.projectId,
      source: "annotation",
      sourceId: parsed.sourceId,
      sessionId,
      traceId: parsed.traceId,
      spanId,
      simulationId: parsed.simulationId,
      issueId: parsed.issueId,
      annotatorId: parsed.annotatorId,
      value: parsed.value,
      passed: parsed.passed,
      feedback: parsed.feedback,
      metadata,
      error: null,
      draftedAt: new Date(),
    })

    return score as AnnotationScore
  })
