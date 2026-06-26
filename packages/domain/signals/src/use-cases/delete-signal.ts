import { EvaluationRepository } from "@domain/evaluations"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  type NotFoundError,
  ProjectId,
  type RepositoryError,
  SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SignalRepository } from "../ports/signal-repository.ts"

const deleteSignalInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  signalId: signalIdSchema,
})

export type DeleteSignalInput = z.input<typeof deleteSignalInputSchema>

export interface DeleteSignalResult {
  readonly signalId: string
}

export type DeleteSignalError = BadRequestError | NotFoundError | ConcurrentSqlTransactionError | RepositoryError

/**
 * Soft-deletes a signal and archives its active evaluation so the matching pipeline stops running
 * it (the active-detector scan excludes archived rows). No ClickHouse cleanup — deleted-signal
 * scores linger and are excluded read-side via the Postgres lifecycle.
 */
export const deleteSignalUseCase = (input: DeleteSignalInput) =>
  Effect.gen(function* () {
    const parsed = deleteSignalInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("signalId", parsed.signalId)
    const sqlClient = yield* SqlClient

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const evaluationRepository = yield* EvaluationRepository

        const signal = yield* signalRepository.findByIdForUpdate(parsed.signalId)
        if (signal.projectId !== parsed.projectId) {
          return yield* new BadRequestError({
            message: `Signal ${signal.id} does not belong to project ${parsed.projectId}`,
          })
        }

        // Discovery-born signals are dismissed through the lifecycle (ignore), not deleted.
        if (signal.origin === "system") {
          return yield* new BadRequestError({
            message: "System-discovered signals cannot be deleted; ignore them instead",
          })
        }

        const active = yield* evaluationRepository.listBySignalId({
          projectId: parsed.projectId,
          signalId: parsed.signalId,
          options: { lifecycle: "active" },
        })
        yield* Effect.forEach(active.items, (evaluation) => evaluationRepository.archive(evaluation.id), {
          discard: true,
        })

        yield* signalRepository.softDelete(parsed.signalId)

        return { signalId: parsed.signalId } satisfies DeleteSignalResult
      }),
    )
  }).pipe(Effect.withSpan("signals.deleteSignal")) as Effect.Effect<
    DeleteSignalResult,
    DeleteSignalError,
    SignalRepository | EvaluationRepository | SqlClient
  >
