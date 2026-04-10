import {
  type AnnotationScore,
  type AnnotationScoreMetadata,
  annotationAnchorSchema,
  annotationScoreSourceIdSchema,
  baseWriteScoreInputSchema,
  SCORE_PUBLICATION_DEBOUNCE,
  type ScoreDraftClosedError,
  type ScoreDraftUpdateConflictError,
  ScoreRepository,
  scoreValueSchema,
} from "@domain/scores"
import {
  type BadRequestError,
  cuidSchema,
  OutboxEventWriter,
  ProjectId,
  type RepositoryError,
  SqlClient,
  sessionIdSchema,
  spanIdSchema,
  TraceId,
  toRepositoryError,
  traceIdSchema,
  UserId,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { resolveWriteAnnotationTraceContext } from "../helpers/resolve-write-annotation-trace-context.ts"
import { persistDraftAnnotation } from "./persist-draft-annotation.ts"

const writeAnnotationInputObjectSchema = z.object({
  id: baseWriteScoreInputSchema.shape.id,
  projectId: cuidSchema.transform(ProjectId),
  sourceId: annotationScoreSourceIdSchema,
  sessionId: sessionIdSchema.nullable().default(null),
  traceId: traceIdSchema.transform(TraceId),
  spanId: spanIdSchema.nullable().default(null),
  simulationId: baseWriteScoreInputSchema.shape.simulationId,
  issueId: baseWriteScoreInputSchema.shape.issueId,
  /** User who created this annotation (nullable for system-generated annotations). */
  annotatorId: cuidSchema.transform(UserId).nullable().default(null),
  value: scoreValueSchema,
  passed: z.boolean(),
  feedback: z.string().min(1),
  anchor: annotationAnchorSchema.optional(),
})

export const writeAnnotationInputSchema = writeAnnotationInputObjectSchema

export type WriteAnnotationInput = z.input<typeof writeAnnotationInputSchema>

export type WriteAnnotationError =
  | RepositoryError
  | BadRequestError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

export const writeAnnotationUseCase = (input: WriteAnnotationInput) =>
  Effect.gen(function* () {
    const parsed = writeAnnotationInputSchema.parse(input)
    const sqlClient = yield* SqlClient
    const outboxEventWriter = yield* OutboxEventWriter
    const scoreRepository = yield* ScoreRepository

    let anchor = parsed.anchor
    let annotatorId = parsed.annotatorId

    if (parsed.id) {
      const existingScore = yield* scoreRepository
        .findById(parsed.id)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

      if (existingScore) {
        // Preserve annotatorId from original if not provided in update
        if (annotatorId === null && existingScore.annotatorId !== null) {
          annotatorId = UserId(existingScore.annotatorId)
        }

        // Preserve anchor from metadata if not provided in update
        if (!anchor) {
          const existingMetadata = existingScore.metadata as AnnotationScoreMetadata | undefined
          if (existingMetadata?.messageIndex !== undefined) {
            anchor = {
              messageIndex: existingMetadata.messageIndex,
              partIndex: existingMetadata.partIndex,
              startOffset: existingMetadata.startOffset,
              endOffset: existingMetadata.endOffset,
            }
          }
        }
      }
    }

    const { sessionId, spanId } = yield* resolveWriteAnnotationTraceContext({
      organizationId: sqlClient.organizationId,
      projectId: parsed.projectId,
      traceId: parsed.traceId,
      sessionId: parsed.sessionId,
      spanId: parsed.spanId,
      anchor,
    })

    const score = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const persistedScore = yield* persistDraftAnnotation({
          id: parsed.id,
          projectId: parsed.projectId,
          sourceId: parsed.sourceId,
          sessionId,
          traceId: parsed.traceId,
          spanId,
          simulationId: parsed.simulationId,
          issueId: parsed.issueId,
          annotatorId,
          value: parsed.value,
          passed: parsed.passed,
          feedback: parsed.feedback,
          organizationId: sqlClient.organizationId,
          messageIndex: anchor?.messageIndex,
          partIndex: anchor?.partIndex,
          startOffset: anchor?.startOffset,
          endOffset: anchor?.endOffset,
        })

        yield* outboxEventWriter
          .write({
            eventName: "AnnotationScorePublishRequested",
            aggregateType: "score",
            aggregateId: persistedScore.id,
            organizationId: persistedScore.organizationId,
            payload: {
              organizationId: persistedScore.organizationId,
              projectId: persistedScore.projectId,
              scoreId: persistedScore.id,
              debounceMs: SCORE_PUBLICATION_DEBOUNCE,
            },
          })
          .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))

        return persistedScore
      }),
    )

    return score as AnnotationScore
  })
