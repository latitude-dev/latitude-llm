import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { DEFAULT_EXPERIMENTS_PAGE_SIZE, MAX_EXPERIMENTS_PAGE_SIZE } from "../constants.ts"
import type { ExperimentListPage } from "../ports/experiment-repository.ts"
import { ExperimentRepository } from "../ports/experiment-repository.ts"

export interface ListExperimentsInput {
  readonly projectId: ProjectId
  readonly limit?: number
  readonly offset?: number
  readonly searchQuery?: string
}

export const listExperimentsUseCase = (
  input: ListExperimentsInput,
): Effect.Effect<ExperimentListPage, RepositoryError, SqlClient | ExperimentRepository> =>
  Effect.gen(function* () {
    const repository = yield* ExperimentRepository
    const limit = Math.min(input.limit ?? DEFAULT_EXPERIMENTS_PAGE_SIZE, MAX_EXPERIMENTS_PAGE_SIZE)
    const offset = Math.max(input.offset ?? 0, 0)
    const trimmedSearchQuery = input.searchQuery?.trim()
    return yield* repository.list({
      projectId: input.projectId,
      limit,
      offset,
      ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
    })
  })
