import { type PersistDraftAnnotationError, persistDraftAnnotation } from "@domain/annotations"
import { ScoreRepository } from "@domain/scores"
import { BadRequestError, generateId, ProjectId, type RepositoryError, SqlClient, TraceId } from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SYSTEM_QUEUE_DRAFT_DEFAULTS } from "../constants.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
import { type RunSystemQueueAnnotatorError, runSystemQueueAnnotatorUseCase } from "./run-system-queue-annotator.ts"
import {
  type SystemQueueAnnotateInput,
  type SystemQueueAnnotateOutput,
  systemQueueAnnotateInputSchema,
  systemQueueAnnotateOutputSchema,
} from "./system-queue-annotator-contracts.ts"

const formatValidationError = (error: z.ZodError): string => error.issues.map((issue) => issue.message).join(", ")

const parseOrBadRequest = <T>(schema: z.ZodType<T>, input: unknown, message: string) =>
  Effect.try({
    try: () => schema.parse(input),
    catch: (error: unknown) =>
      new BadRequestError({
        message: error instanceof z.ZodError ? formatValidationError(error) : message,
      }),
  })

export type SystemQueueAnnotateError =
  | BadRequestError
  | RepositoryError
  | RunSystemQueueAnnotatorError
  | PersistDraftAnnotationError

/**
 * Orchestrates the creation of a queue item and queue-backed draft annotation
 * for a system queue match. This use case is idempotent - retrying with the same
 * (queueId, traceId) will return existing artifacts without creating duplicates.
 *
 * The operation is transactional: either both the queue item and draft annotation
 * are persisted, or neither is (on annotator failure or other errors).
 *
 * System-created drafts:
 * - Use `source = "annotation"` with `sourceId = queueId`
 * - Have `draftedAt != null` (draft status)
 * - Default to `passed = false`, `value = 0`, no anchor (conversation-level)
 * - Do NOT auto-publish (no `annotation-scores:publish` event)
 */
export const systemQueueAnnotateUseCase = (input: SystemQueueAnnotateInput) =>
  Effect.gen(function* () {
    const parsedInput = yield* parseOrBadRequest(
      systemQueueAnnotateInputSchema,
      input,
      "Invalid system queue annotate input",
    )

    const projectId = ProjectId(parsedInput.projectId)
    const traceId = TraceId(parsedInput.traceId)

    const sqlClient = yield* SqlClient

    const queueRepository = yield* AnnotationQueueRepository
    const queue = yield* queueRepository.findSystemQueueBySlugInProject({
      projectId,
      queueSlug: parsedInput.queueSlug,
    })

    if (!queue) {
      return yield* new BadRequestError({
        message: `System queue not found for slug: ${parsedInput.queueSlug}`,
      })
    }

    const queueId = queue.id

    const scoreRepository = yield* ScoreRepository
    const existingDraft = yield* scoreRepository.findQueueDraftByTraceId({
      projectId,
      queueId,
      traceId,
    })

    if (existingDraft !== null) {
      const itemRepository = yield* AnnotationQueueItemRepository
      const wasInserted = yield* itemRepository.insertIfNotExists({
        projectId,
        queueId,
        traceId,
      })

      return systemQueueAnnotateOutputSchema.parse({
        queueId,
        traceId: parsedInput.traceId,
        draftAnnotationId: existingDraft.id,
        wasCreated: wasInserted,
      }) as SystemQueueAnnotateOutput
    }

    const annotatorResult = yield* runSystemQueueAnnotatorUseCase({
      organizationId: parsedInput.organizationId,
      projectId: parsedInput.projectId,
      queueSlug: parsedInput.queueSlug,
      traceId: parsedInput.traceId,
    })

    const result = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const itemRepository = yield* AnnotationQueueItemRepository

        const wasInserted = yield* itemRepository.insertIfNotExists({
          projectId,
          queueId,
          traceId,
        })

        if (wasInserted) {
          yield* queueRepository.incrementTotalItems({
            projectId,
            queueId,
          })
        }

        if (!wasInserted) {
          const racingDraft = yield* scoreRepository.findQueueDraftByTraceId({
            projectId,
            queueId,
            traceId,
          })

          if (racingDraft !== null) {
            return {
              draftAnnotationId: racingDraft.id,
              wasCreated: false,
            }
          }
        }

        const draftAnnotation = yield* persistDraftAnnotation({
          id: generateId<"ScoreId">(),
          projectId,
          sourceId: queueId,
          traceId,
          sessionId: null,
          spanId: null,
          simulationId: null,
          issueId: null,
          value: SYSTEM_QUEUE_DRAFT_DEFAULTS.value,
          passed: SYSTEM_QUEUE_DRAFT_DEFAULTS.passed,
          feedback: annotatorResult.feedback,
          organizationId: parsedInput.organizationId,
        })

        return {
          draftAnnotationId: draftAnnotation.id,
          wasCreated: true,
        }
      }),
    )

    return systemQueueAnnotateOutputSchema.parse({
      queueId,
      traceId: parsedInput.traceId,
      draftAnnotationId: result.draftAnnotationId,
      wasCreated: result.wasCreated,
    }) as SystemQueueAnnotateOutput
  })
