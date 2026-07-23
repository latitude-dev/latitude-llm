import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { ExperimentRepository, type ExperimentSearchResult } from "../ports/experiment-repository.ts"

const DEFAULT_SEARCH_LIMIT = 8

export interface SearchExperimentsInput {
  readonly searchQuery?: string
  readonly preferProjectId?: ProjectId
  readonly limit?: number
}

/**
 * Org-wide experiment name search for the Command Palette. Delegates to the repository's org-scoped
 * search (RLS-bound to the caller's organization); `preferProjectId` ranks the current project first.
 */
export const searchExperimentsUseCase = (
  input: SearchExperimentsInput,
): Effect.Effect<readonly ExperimentSearchResult[], RepositoryError, SqlClient | ExperimentRepository> =>
  Effect.gen(function* () {
    const repository = yield* ExperimentRepository
    const trimmedSearchQuery = input.searchQuery?.trim()
    return yield* repository.searchOrgWide({
      ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
      ...(input.preferProjectId !== undefined ? { preferProjectId: input.preferProjectId } : {}),
      limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
    })
  })
