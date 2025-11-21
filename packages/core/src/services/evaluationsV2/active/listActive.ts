import { Cache } from '../../../cache'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'
import { listCachedEvaluations } from './listCached'
import { ActiveEvaluation } from '@latitude-data/constants/evaluations'

export async function listActiveEvaluations({
  workspaceId,
  projectId,
  cache,
}: {
  workspaceId: number
  projectId: number
  cache?: Cache
}): PromisedResult<ActiveEvaluation[], Error> {
  const listing = await listCachedEvaluations({ workspaceId, projectId, cache })
  if (listing.error) return Result.error(listing.error)
  let active = listing.value

  active = [...active].sort(
    (a, b) =>
      (b.startedAt?.getTime() ?? 0) - (a.startedAt?.getTime() ?? 0) ||
      b.queuedAt.getTime() - a.queuedAt.getTime(),
  )
  // No need for pagination as there won't be that many evaluations active at the same time for one project
  return Result.ok(active)
}
