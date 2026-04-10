import type { QueuePublishError } from "@domain/queue"
import { QueuePublisher } from "@domain/queue"
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
  writeScoreUseCase,
} from "@domain/scores"
import {
  type BadRequestError,
  cuidSchema,
  ProjectId,
  type RepositoryError,
  SqlClient,
  sessionIdSchema,
  spanIdSchema,
  TraceId,
  traceIdSchema,
  UserId,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { resolveWriteAnnotationTraceContext } from "../helpers/resolve-write-annotation-trace-context.ts"

const writeAnnotationInputObjectSchema = z.object({
  id: baseWriteScoreInputSchema.shape.id, // optional CUID for draft updates
  projectId: cuidSchema.transform(ProjectId),
  sourceId: annotationScoreSourceIdSchema, // "UI" | "API" | <annotation-queue-cuid>
  /**
   * Optional; when omitted the use case fills this from the trace row (`TraceDetail.sessionId` / CH materialized trace).
   */
  sessionId: sessionIdSchema.nullable().default(null),
  /** Required: annotations are always scoped to a trace. */
  traceId: traceIdSchema.transform(TraceId),
  /**
   * Optional; when omitted the use case picks the latest LLM span (`chat` or `text_completion`) for this trace.
   */
  spanId: spanIdSchema.nullable().default(null),
  simulationId: baseWriteScoreInputSchema.shape.simulationId,
  issueId: baseWriteScoreInputSchema.shape.issueId,
  /** User who created this annotation (nullable for system-generated annotations). */
  annotatorId: cuidSchema.transform(UserId).nullable().default(null),
  value: scoreValueSchema,
  passed: z.boolean(),
  /** Human-authored feedback; persisted as `metadata.rawFeedback` and initial `feedback` on the score. */
  feedback: z.string().min(1),
  /** Conversation / message / text-range anchor; flattened into `metadata` on persist. */
  anchor: annotationAnchorSchema.optional(),
})

export const writeAnnotationInputSchema = writeAnnotationInputObjectSchema

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
    const sqlClient = yield* SqlClient
    const scoreRepository = yield* ScoreRepository

    let anchor = parsed.anchor

    if (parsed.id && !anchor) {
      const existingScore = yield* scoreRepository
        .findById(parsed.id)
        .pipe(Effect.catchTag("NotFoundError", () => Effect.succeed(null)))

      if (existingScore) {
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

    const { sessionId, spanId } = yield* resolveWriteAnnotationTraceContext({
      organizationId: sqlClient.organizationId,
      projectId: parsed.projectId,
      traceId: parsed.traceId,
      sessionId: parsed.sessionId,
      spanId: parsed.spanId,
      anchor,
    })

    const metadata: AnnotationScoreMetadata = {
      rawFeedback: parsed.feedback,
      ...(anchor ?? {}),
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
      feedback: parsed.feedback, // initial display text; enrichment overwrites `feedback` on publication
      metadata,
      error: null, // annotations are human-authored, not executed evaluators
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
