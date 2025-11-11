import { DEFAULT_PAGINATION_SIZE } from '../../../constants'
import {
  RunSourceGroup,
  LogSources,
  RUN_SOURCES,
  ActiveRun,
} from '@latitude-data/constants'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { listCachedRuns } from './listCached'
import type { Cache } from '../../../cache'

/**
 * Lists active runs with pagination and optional source filtering.
 */
export async function listActiveRuns({
  workspaceId,
  projectId,
  page = 1,
  pageSize = DEFAULT_PAGINATION_SIZE,
  sourceGroup,
  cache,
}: {
  workspaceId: number
  projectId: number
  page?: number
  pageSize?: number
  sourceGroup?: RunSourceGroup
  cache?: Cache
}): PromisedResult<ActiveRun[], Error> {
  const listing = await listCachedRuns(workspaceId, projectId, cache)
  if (listing.error) return Result.error(listing.error)
  let active = listing.value

  // Filter by sources if provided
  if (sourceGroup) {
    const sources = RUN_SOURCES[sourceGroup]

    active = active.filter((run) => {
      const runSource = run.source ?? LogSources.API
      return sources.includes(runSource)
    })
  }

  active = [...active].sort(
    (a, b) =>
      (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0) ||
      b.queuedAt.getTime() - a.queuedAt.getTime(),
  )
  active = active.slice((page - 1) * pageSize, page * pageSize)

  return Result.ok(active)
}
