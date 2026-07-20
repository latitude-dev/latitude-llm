import { type ExperimentId, type NotFoundError, type RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Experiment } from "../entities/experiment.ts"
import { ExperimentRepository } from "../ports/experiment-repository.ts"

export interface DeleteExperimentInput {
  readonly id: ExperimentId
}

export type DeleteExperimentError = NotFoundError | RepositoryError

/** Soft-deletes an experiment (hidden from lists; slug becomes reusable). */
export const deleteExperimentUseCase = (
  input: DeleteExperimentInput,
): Effect.Effect<Experiment, DeleteExperimentError, SqlClient | ExperimentRepository> =>
  Effect.gen(function* () {
    const sqlClient = yield* SqlClient
    return yield* sqlClient.transaction(
      Effect.gen(function* () {
        const repository = yield* ExperimentRepository
        const experiment = yield* repository.findById(input.id)
        const now = new Date()
        yield* repository.softDelete(input.id)
        return { ...experiment, deletedAt: now, updatedAt: now }
      }),
    )
  })
