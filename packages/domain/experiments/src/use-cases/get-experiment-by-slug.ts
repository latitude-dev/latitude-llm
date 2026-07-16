import type { NotFoundError, ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Experiment } from "../entities/experiment.ts"
import { ExperimentRepository } from "../ports/experiment-repository.ts"

export interface GetExperimentBySlugInput {
  readonly projectId: ProjectId
  readonly slug: string
}

export const getExperimentBySlugUseCase = (
  input: GetExperimentBySlugInput,
): Effect.Effect<Experiment, NotFoundError | RepositoryError, SqlClient | ExperimentRepository> =>
  Effect.gen(function* () {
    const repository = yield* ExperimentRepository
    return yield* repository.findBySlug(input)
  })
