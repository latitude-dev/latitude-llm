import {
  ACTIVE_EVALUATIONS_CACHE_KEY,
  ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS,
  ActiveEvaluation,
} from '@latitude-data/constants/evaluations'
import { cache as redis, Cache } from '../../../cache'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

export async function createActiveEvaluation({
  workspaceId,
  projectId,
  evaluationUuid,
  workflowUuid,
  issueId,
  queuedAt,
  cache,
}: {
  workspaceId: number
  projectId: number
  workflowUuid: string
  issueId: number
  evaluationUuid?: string
  queuedAt: Date
  cache?: Cache
}): PromisedResult<ActiveEvaluation, Error> {
  const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    const activeEvaluation: ActiveEvaluation = {
      workflowUuid,
      evaluationUuid,
      issueId,
      queuedAt,
    }
    const jsonValue = JSON.stringify(activeEvaluation)

    await redisCache
      .multi()
      .hset(key, workflowUuid, jsonValue)
      .expire(key, ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(activeEvaluation)
  } catch (error) {
    return Result.error(error as Error)
  }
}
