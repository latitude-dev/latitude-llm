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
  workflowUuid,
  startedAt,
  endedAt,
  error,
  cache,
}: {
  workspaceId: number
  projectId: number
  workflowUuid: string
  evaluationUuid?: string
  startedAt?: Date
  endedAt?: Date
  error?: Error
  cache?: Cache
}): PromisedResult<ActiveEvaluation, Error> {
  const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    const jsonValue = await redisCache.hget(key, workflowUuid)
    if (!jsonValue) {
      return Result.error(
        new NotFoundError(
          `Active evaluation not found with workflowUuid ${workflowUuid} while updating the evaluation`,
        ),
      )
    }

    const existingEvaluation = JSON.parse(jsonValue)
    const updatedEvaluation: ActiveEvaluation = {
      ...existingEvaluation,
      evaluationUuid: evaluationUuid ?? existingEvaluation.evaluationUuid,
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

    // This refreshes the TTL of the workspace/project key to 3 hours again
    await redisCache
      .multi()
      .hset(key, workflowUuid, JSON.stringify(updatedEvaluation))
      .expire(key, ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(updatedEvaluation)
  } catch (error) {
    return Result.error(error as Error)
  }
}
