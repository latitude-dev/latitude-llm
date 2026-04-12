import { type PersistDraftAnnotationError, persistDraftAnnotation } from "@domain/annotations"
import { ScoreRepository } from "@domain/scores"
import {
  BadRequestError,
  generateId,
  type NotFoundError,
  OrganizationId,
  ProjectId,
  type RepositoryError,
  SqlClient,
  TraceId,
} from "@domain/shared"
import { TraceRepository } from "@domain/spans"
import { Effect } from "effect"
import { z } from "zod"
import { SYSTEM_QUEUE_DRAFT_DEFAULTS } from "../constants.ts"
import { AnnotationQueueItemRepository } from "../ports/annotation-queue-item-repository.ts"
import { AnnotationQueueRepository } from "../ports/annotation-queue-repository.ts"
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

export interface PersistSystemQueueAnnotationInput extends SystemQueueAnnotateInput {
  readonly queueId: string
  readonly feedback: string
}

export type PersistSystemQueueAnnotationError =
  | BadRequestError
  | RepositoryError
  | NotFoundError
  | PersistDraftAnnotationError

/**
 * Persists a system queue annotation by creating the queue item and draft annotation
 * transactionally. This use case handles idempotency - if a draft already exists for
 * the (queueId, traceId) pair, it will return the existing draft without creating duplicates.
 *
 * This is the transactional counterpart to draftSystemQueueAnnotationUseCase.
 * System-created drafts:
 * - Use `source = "annotation"` with `sourceId = queueId`
 * - Have `draftedAt != null` (draft status)
 * - Default to `passed = false`, `value = 0`, no anchor (conversation-level)
 * - Do NOT auto-publish (no `annotation-scores:publish` event)
 */
export const persistSystemQueueAnnotationUseCase = (input: PersistSystemQueueAnnotationInput) =>
  Effect.gen(function* () {
    const parsedInput = yield* parseOrBadRequest(
      systemQueueAnnotateInputSchema,
      input,
      "Invalid system queue annotate input",
    )

    const organizationId = OrganizationId(parsedInput.organizationId)
    const projectId = ProjectId(parsedInput.projectId)
    const traceId = TraceId(parsedInput.traceId)
    const queueId = input.queueId

    const sqlClient = yield* SqlClient
    const queueRepository = yield* AnnotationQueueRepository
    const scoreRepository = yield* ScoreRepository
    const traceRepository = yield* TraceRepository

    const trace = yield* traceRepository.findByTraceId({
      organizationId,
      projectId,
      traceId,
    })
    const traceCreatedAt = trace.startTime

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
        traceCreatedAt,
      })

      return systemQueueAnnotateOutputSchema.parse({
        queueId,
        traceId: parsedInput.traceId,
        draftAnnotationId: existingDraft.id,
        wasCreated: wasInserted,
      }) as SystemQueueAnnotateOutput
    }

    const result = yield* sqlClient.transaction(
      Effect.gen(function* () {
        const itemRepository = yield* AnnotationQueueItemRepository

        const wasInserted = yield* itemRepository.insertIfNotExists({
          projectId,
          queueId,
          traceId,
          traceCreatedAt,
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
          feedback: input.feedback,
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
