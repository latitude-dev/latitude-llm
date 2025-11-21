import {
  ACTIVE_EVALUATIONS_CACHE_KEY,
  ACTIVE_EVALUATIONS_CACHE_TTL,
  ActiveEvaluation,
} from '@latitude-data/constants/evaluations'
import { PromisedResult } from '../../../lib/Transaction'
import { cache as redis, Cache } from '../../../cache'
import { Result } from '../../../lib/Result'

export async function listCachedEvaluations({
  workspaceId,
  projectId,
  cache,
}: {
  workspaceId: number
  projectId: number
  cache?: Cache
}): PromisedResult<ActiveEvaluation[], Error> {
  const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    // Use HGETALL is an O(N) operation, but the entire hash expires in 3 hours, so N won't be too large
    const hashData = await redisCache.hgetall(key)
    if (!hashData || Object.keys(hashData).length === 0) {
      return Result.ok([])
    }

    const activeEvaluations: ActiveEvaluation[] = []
    const now = Date.now()

    for (const jsonValue of Object.values(hashData)) {
      try {
        const evaluation = JSON.parse(jsonValue) as ActiveEvaluation
        const queuedAt = new Date(evaluation.queuedAt)

        // Filter expired evaluations (the entire hash expires in 3 hours, but it updates back to its initial TTL on every update to the hash, so we need to check each evaluation individually of the hash to check if they're still valid)
        if (queuedAt.getTime() > now - ACTIVE_EVALUATIONS_CACHE_TTL) {
          activeEvaluations.push({
            ...evaluation,
            queuedAt,
            startedAt: evaluation.startedAt
              ? new Date(evaluation.startedAt)
              : undefined,
          })
        }
      } catch (parseError) {
        continue
      }
    }

    return Result.ok(activeEvaluations)
  } catch (error) {
    return Result.error(error as Error)
  }
}
