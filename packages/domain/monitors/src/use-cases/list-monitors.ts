import type { ProjectId, RepositoryError, SqlClient } from "@domain/shared"
import { Effect } from "effect"
import type { Monitor } from "../entities/monitor.ts"
import { MonitorRepository } from "../ports/monitor-repository.ts"

export const DEFAULT_MONITORS_PAGE_SIZE = 50
export const MAX_MONITORS_PAGE_SIZE = 100

export interface ListMonitorsInput {
  readonly projectId: ProjectId
  /** Default {@link DEFAULT_MONITORS_PAGE_SIZE}, clamped to {@link MAX_MONITORS_PAGE_SIZE}. */
  readonly limit?: number
  readonly offset?: number
  /** Case-insensitive name substring; blank is treated as no filter. */
  readonly searchQuery?: string
}

export interface ListMonitorsResult {
  readonly items: readonly Monitor[]
  readonly totalCount: number
  readonly hasMore: boolean
  readonly limit: number
  readonly offset: number
}

export const listMonitorsUseCase = (
  input: ListMonitorsInput,
): Effect.Effect<ListMonitorsResult, RepositoryError, SqlClient | MonitorRepository> =>
  Effect.gen(function* () {
    const repository = yield* MonitorRepository
    const limit = Math.min(input.limit ?? DEFAULT_MONITORS_PAGE_SIZE, MAX_MONITORS_PAGE_SIZE)
    const offset = Math.max(input.offset ?? 0, 0)
    const trimmedSearchQuery = input.searchQuery?.trim()
    const page = yield* repository.list({
      projectId: input.projectId,
      limit,
      offset,
      ...(trimmedSearchQuery ? { searchQuery: trimmedSearchQuery } : {}),
    })
    return page
  })
