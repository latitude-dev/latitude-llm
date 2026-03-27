import type { QueuePublishError } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
import {
  type AnnotationScore,
  annotationScoreSourceIdSchema,
  baseWriteScoreInputSchema,
  SCORE_PUBLICATION_DEBOUNCE,
  type ScoreDraftClosedError,
  type ScoreDraftUpdateConflictError,
  scoreValueSchema,
  writeScoreUseCase,
} from "@domain/scores"
import { type BadRequestError, cuidSchema, ProjectId, type RepositoryError } from "@domain/shared"
import { sessionIdSchema, spanIdSchema, traceIdSchema } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"

export const writeAnnotationInputSchema = z
  .object({
    id: baseWriteScoreInputSchema.shape.id, // optional CUID for draft updates
    projectId: cuidSchema.transform(ProjectId),
    sourceId: annotationScoreSourceIdSchema, // "UI" | "API" | <annotation-queue-cuid>
    sessionId: sessionIdSchema.nullable().default(null),
    traceId: traceIdSchema.nullable().default(null),
    spanId: spanIdSchema.nullable().default(null),
    simulationId: baseWriteScoreInputSchema.shape.simulationId,
    issueId: baseWriteScoreInputSchema.shape.issueId,
    value: scoreValueSchema,
    passed: z.boolean(),
    rawFeedback: z.string().min(1), // human-authored feedback text
    messageIndex: z.number().int().nonnegative().optional(), // optional message index in the canonical conversation; omit for conversation-level annotations
    partIndex: z.number().int().nonnegative().optional(), // optional raw GenAI `parts[]` index inside the target message
    startOffset: z.number().int().nonnegative().optional(), // optional start offset for substring annotations within a textual part
    endOffset: z.number().int().nonnegative().optional(), // optional end offset for substring annotations within a textual part
    error: baseWriteScoreInputSchema.shape.error,
  })
  .superRefine((input, ctx) => {
    const hasMessageIndex = input.messageIndex !== undefined
    const hasPartIndex = input.partIndex !== undefined
    const hasStartOffset = input.startOffset !== undefined
    const hasEndOffset = input.endOffset !== undefined
    const hasTextRange = hasStartOffset || hasEndOffset

    if (!hasMessageIndex && hasPartIndex) {
      ctx.addIssue({ code: "custom", message: "partIndex requires messageIndex", path: ["partIndex"] })
    }
    if (hasStartOffset !== hasEndOffset) {
      ctx.addIssue({
        code: "custom",
        message: "startOffset and endOffset must be provided together",
        path: hasStartOffset ? ["endOffset"] : ["startOffset"],
      })
    }
    if (hasTextRange && !hasPartIndex) {
      ctx.addIssue({
        code: "custom",
        message: "startOffset and endOffset require partIndex",
        path: ["partIndex"],
      })
    }
    if (input.startOffset !== undefined && input.endOffset !== undefined && input.startOffset > input.endOffset) {
      ctx.addIssue({
        code: "custom",
        message: "endOffset must be greater than or equal to startOffset",
        path: ["endOffset"],
      })
    }
  })
export type WriteAnnotationInput = z.input<typeof writeAnnotationInputSchema>

export type WriteAnnotationError =
  | RepositoryError
  | BadRequestError
  | QueuePublishError
  | ScoreDraftClosedError
  | ScoreDraftUpdateConflictError

export const writeAnnotationUseCase = (input: WriteAnnotationInput) =>
  Effect.gen(function* () {
    const parsed = writeAnnotationInputSchema.parse(input)
    const publisher = yield* QueuePublisher

    const metadata = {
      rawFeedback: parsed.rawFeedback,
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
      sessionId: parsed.sessionId,
      traceId: parsed.traceId,
      spanId: parsed.spanId,
      simulationId: parsed.simulationId,
      issueId: parsed.issueId,
      value: parsed.value,
      passed: parsed.passed,
      feedback: parsed.rawFeedback, // raw feedback as initial feedback; enrichment happens during finalization
      metadata,
      error: parsed.error,
      draftedAt: new Date(), // annotations always start as drafts
    })

    yield* publisher.publish(
      "annotation-scores",
      "publish",
      {
        organizationId: score.organizationId,
        projectId: score.projectId,
        scoreId: score.id,
      },
      {
        dedupeKey: `annotation-scores:publish:${score.id}`,
        debounceMs: SCORE_PUBLICATION_DEBOUNCE,
      },
    )

    return score as AnnotationScore
  })
