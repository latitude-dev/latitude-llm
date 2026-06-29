import { EvaluationRepository, updateEvaluationTriggerFilter } from "@domain/evaluations"
import {
  BadRequestError,
  type ConcurrentSqlTransactionError,
  cuidSchema,
  filterSetSchema,
  type NotFoundError,
  ProjectId,
  type RepositoryError,
  SqlClient,
  signalIdSchema,
} from "@domain/shared"
import { Effect } from "effect"
import { z } from "zod"
import { SIGNAL_NAME_MAX_LENGTH } from "../constants.ts"
import { SignalRepository } from "../ports/signal-repository.ts"

const updateSignalInputSchema = z.object({
  projectId: cuidSchema.transform(ProjectId),
  signalId: signalIdSchema,
  // `undefined` (key omitted) leaves a field unchanged; for `filters`, explicit `null` clears it.
  name: z.string().min(1).max(SIGNAL_NAME_MAX_LENGTH).optional(),
  description: z.string().min(1).optional(),
  filters: filterSetSchema.nullable().optional(),
  now: z.date().optional(),
})

export type UpdateSignalInput = z.input<typeof updateSignalInputSchema>

export interface UpdateSignalResult {
  readonly signalId: string
  readonly changed: boolean
}

export type UpdateSignalError = BadRequestError | NotFoundError | ConcurrentSqlTransactionError | RepositoryError

/**
 * Updates a signal's descriptive fields and its evaluation pre-gate (`filters`). Filter changes
 * apply forward-only — existing scores keep their frozen membership. The slug is intentionally
 * stable (it is the API identifier); triage (priority/assignee) and lifecycle stay on their own
 * use-cases.
 */
export const updateSignalUseCase = (input: UpdateSignalInput) =>
  Effect.gen(function* () {
    const parsed = updateSignalInputSchema.parse(input)
    yield* Effect.annotateCurrentSpan("signalId", parsed.signalId)
    const sqlClient = yield* SqlClient
    const now = parsed.now ?? new Date()

    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const signalRepository = yield* SignalRepository
        const signal = yield* signalRepository.findByIdForUpdate(parsed.signalId)
        if (signal.projectId !== parsed.projectId) {
          return yield* new BadRequestError({
            message: `Signal ${signal.id} does not belong to project ${parsed.projectId}`,
          })
        }

        const nextName = parsed.name ?? signal.name
        const nextDescription = parsed.description ?? signal.description
        const nextFilters = parsed.filters === undefined ? (signal.filters ?? null) : parsed.filters
        const nameChanged = parsed.name !== undefined && parsed.name !== signal.name
        const changed =
          nameChanged ||
          (parsed.description !== undefined && parsed.description !== signal.description) ||
          parsed.filters !== undefined

        if (!changed) {
          return { signalId: signal.id, changed: false } satisfies UpdateSignalResult
        }

        yield* signalRepository.save({
          ...signal,
          name: nextName,
          description: nextDescription,
          filters: nextFilters,
          updatedAt: now,
        })

        const evaluationRepository = yield* EvaluationRepository
        const active = yield* evaluationRepository.listBySignalId({
          projectId: parsed.projectId,
          signalId: parsed.signalId,
          options: { lifecycle: "active" },
        })

        if (nameChanged || parsed.filters !== undefined) {
          const nextFilter = parsed.filters !== undefined ? filterSetSchema.parse(nextFilters ?? {}) : undefined
          yield* Effect.forEach(
            active.items,
            (evaluation) => {
              let next = evaluation
              if (nextFilter !== undefined) {
                next = updateEvaluationTriggerFilter({ evaluation: next, filter: nextFilter, updatedAt: now })
              }
              if (nameChanged) {
                next = { ...next, name: nextName, updatedAt: now }
              }
              return evaluationRepository.save(next)
            },
            { discard: true },
          )
        }

        return { signalId: signal.id, changed: true } satisfies UpdateSignalResult
      }),
    )
  }).pipe(Effect.withSpan("signals.updateSignal")) as Effect.Effect<
    UpdateSignalResult,
    UpdateSignalError,
    SignalRepository | EvaluationRepository | SqlClient
  >
