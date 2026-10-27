import { OutboxEventWriter } from "@domain/events"
import { type FilterSet, type ProjectId, SqlClient, type TraceId, toRepositoryError } from "@domain/shared"
import { Effect } from "effect"
import {
  buildTraceDeletionFilters,
  createTraceDeletionRequest,
  TRACE_DELETION_MAX_TRACE_IDS,
  type TraceDeletionRequester,
  traceDeletionFiltersProblem,
} from "../entities/trace-deletion-request.ts"
import { InvalidTraceDeletionSelectorError } from "../errors.ts"
import { TraceDeletionRequestRepository } from "../ports/trace-deletion-request-repository.ts"

export interface TraceDeletionSelectorInput {
  readonly filters?: FilterSet | undefined
  readonly traceIds?: readonly TraceId[] | undefined
}

/** Validates a selector and folds it into the single filter set a deletion runs on. */
export const resolveTraceDeletionFilters = (input: TraceDeletionSelectorInput) =>
  Effect.gen(function* () {
    if ((input.traceIds?.length ?? 0) > TRACE_DELETION_MAX_TRACE_IDS) {
      return yield* new InvalidTraceDeletionSelectorError({
        reason: `A trace deletion can name at most ${TRACE_DELETION_MAX_TRACE_IDS} trace ids; select larger sets with filters`,
      })
    }
    const filters = buildTraceDeletionFilters(input)
    const problem = traceDeletionFiltersProblem(filters)
    if (problem) return yield* new InvalidTraceDeletionSelectorError({ reason: problem })
    return filters
  })

export const createTraceDeletionRequestUseCase = Effect.fn("spans.createTraceDeletionRequest")(function* (
  input: TraceDeletionSelectorInput & {
    readonly projectId: ProjectId
    readonly requestedBy: TraceDeletionRequester
  },
) {
  yield* Effect.annotateCurrentSpan("project.id", input.projectId)
  const filters = yield* resolveTraceDeletionFilters(input)
  const sqlClient = yield* SqlClient
  const request = createTraceDeletionRequest({
    organizationId: sqlClient.organizationId,
    projectId: input.projectId,
    filters,
    requestedBy: input.requestedBy,
  })

  yield* sqlClient.transaction(
    Effect.gen(function* () {
      const repository = yield* TraceDeletionRequestRepository
      const outboxEventWriter = yield* OutboxEventWriter

      yield* repository.save(request)
      yield* outboxEventWriter
        .write({
          eventName: "TraceDeletionRequestCreated",
          aggregateType: "trace_deletion_request",
          aggregateId: request.id,
          organizationId: request.organizationId,
          payload: {
            organizationId: request.organizationId,
            projectId: request.projectId,
            traceDeletionRequestId: request.id,
          },
        })
        .pipe(Effect.mapError((error) => toRepositoryError(error, "write")))
    }),
  )

  return request
})
