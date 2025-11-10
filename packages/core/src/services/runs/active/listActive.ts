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

/**
 * Lists active runs with pagination and optional source filtering.
 */
export async function listActiveRuns({
  workspaceId,
  projectId,
  page = 1,
  pageSize = DEFAULT_PAGINATION_SIZE,
  sourceGroup,
}: {
  workspaceId: number
  projectId: number
  page?: number
  pageSize?: number
  sourceGroup?: RunSourceGroup
}): PromisedResult<ActiveRun[], Error> {
  const listing = await listCachedRuns(workspaceId, projectId)
  if (listing.error) return Result.error(listing.error)
  const active = listing.value

  let runs = Object.values(active)

  // Filter by sources if provided
  if (sourceGroup) {
    const sources = RUN_SOURCES[sourceGroup]

    runs = runs.filter((run) => {
      const runSource = run.source ?? LogSources.API
      return sources.includes(runSource)
    })
  }

  runs = runs.sort(
    (a, b) =>
      (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0) ||
      b.queuedAt.getTime() - a.queuedAt.getTime(),
  )
  runs = runs.slice((page - 1) * pageSize, page * pageSize)

  return Result.ok(runs)
}
