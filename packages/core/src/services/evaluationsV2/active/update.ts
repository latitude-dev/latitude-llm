import {
  ACTIVE_EVALUATIONS_CACHE_KEY,
  ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS,
  ActiveEvaluation,
} from '@latitude-data/constants/evaluations'
import { cache as redis, Cache } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

export async function updateActiveEvaluation({
  workspaceId,
  projectId,
  evaluationUuid,
  startedAt,
  endedAt,
  error,
  cache,
}: {
  workspaceId: number
  projectId: number
  evaluationUuid: string
  startedAt?: Date
  endedAt?: Date
  error?: Error
  cache?: Cache
}): PromisedResult<ActiveEvaluation, Error> {
  const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    // Get the value of the hash field (O(1) operation)
    const jsonValue = await redisCache.hget(key, evaluationUuid)
    if (!jsonValue) {
      return Result.error(
        new NotFoundError(
          `Evaluation not found with uuid ${evaluationUuid} while updating the evaluation`,
        ),
      )
    }

    const existingEvaluation = JSON.parse(jsonValue)
    const updatedEvaluation: ActiveEvaluation = {
      ...existingEvaluation,
      queuedAt: new Date(existingEvaluation.queuedAt),
      startedAt:
        startedAt ??
        (existingEvaluation.startedAt
          ? new Date(existingEvaluation.startedAt)
          : undefined),
      endedAt:
        endedAt ??
        (existingEvaluation.endedAt
          ? new Date(existingEvaluation.endedAt)
          : undefined),
      error: error ?? existingEvaluation.error,
    }

    // Use HSET to atomically update the evaluation in the hash, refreshing the TTL of the workspace/project key to 3 hours
    await redisCache
      .multi()
      .hset(key, evaluationUuid, JSON.stringify(updatedEvaluation))
      .expire(key, ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(updatedEvaluation)
  } catch (error) {
    return Result.error(error as Error)
  }
}
