import { LOG_SOURCES, LogSources } from '../../../constants'
import { Result } from '../../../lib/Result'
import { listCachedRuns } from './listCached'
import { PromisedResult } from '../../../lib/Transaction'
import type { Cache } from '../../../cache'

export async function countActiveRunsBySource({
  workspaceId,
  projectId,
  cache,
}: {
  workspaceId: number
  projectId: number
  cache?: Cache
}): PromisedResult<Record<LogSources, number>, Error> {
  const listing = await listCachedRuns(workspaceId, projectId, cache)
  if (listing.error) return Result.error(listing.error)
  const active = listing.value

  const countBySource: Record<LogSources, number> = LOG_SOURCES.reduce(
    (acc, source) => ({ ...acc, [source]: 0 }),
    {} as Record<LogSources, number>,
  )

  Object.values(active).forEach((run) => {
    const source = run.source ?? LogSources.API
    countBySource[source] = (countBySource[source] ?? 0) + 1
  })

  return Result.ok(countBySource)
}
