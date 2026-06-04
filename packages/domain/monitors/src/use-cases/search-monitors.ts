import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import { MonitorRepository, type MonitorSearchResult } from "../ports/monitor-repository.ts"

const DEFAULT_SEARCH_LIMIT = 8

export interface SearchMonitorsInput {
  readonly searchQuery?: string
  readonly preferProjectId?: ProjectId
  readonly limit?: number
}

/**
 * Org-wide monitor name search for the Command Palette. Delegates to the repository's org-scoped
 * search (RLS-bound to the caller's organization); results span every project in the org and carry
 * their owning project's slug/name plus the system/muted status the palette renders.
 * `preferProjectId` (the palette's current project, when any) ranks that project's monitors first.
 */
export const searchMonitorsUseCase = (
  input: SearchMonitorsInput,
): Effect.Effect<readonly MonitorSearchResult[], RepositoryError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository
    const trimmedSearchQuery = input.searchQuery?.trim()
    return yield* repository.searchOrgWide({
      ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
      ...(input.preferProjectId !== undefined ? { preferProjectId: input.preferProjectId } : {}),
      limit: input.limit ?? DEFAULT_SEARCH_LIMIT,
    })
  })
