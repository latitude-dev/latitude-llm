import {
  ACTIVE_EVALUATIONS_CACHE_KEY,
  ActiveEvaluation,
} from '@latitude-data/constants/evaluations'
import { cache as redis, Cache } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

export async function getActiveEvaluation({
  workspaceId,
  projectId,
  evaluationUuid,
  cache,
}: {
  workspaceId: number
  projectId: number
  evaluationUuid: string
  cache?: Cache
}): PromisedResult<ActiveEvaluation, Error> {
  const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    const jsonValue = await redisCache.hget(key, evaluationUuid)
    if (!jsonValue) {
      return Result.error(
        new NotFoundError(`Evaluation not found with uuid ${evaluationUuid}`),
      )
    }
    const evaluation = JSON.parse(jsonValue) as ActiveEvaluation
    return Result.ok({
      ...evaluation,
      queuedAt: new Date(evaluation.queuedAt),
      startedAt: evaluation.startedAt
        ? new Date(evaluation.startedAt)
        : undefined,
      endedAt: evaluation.endedAt ? new Date(evaluation.endedAt) : undefined,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
