import {
  ACTIVE_EVALUATIONS_CACHE_KEY,
  ActiveEvaluation,
} from '@latitude-data/constants/evaluations'
import { cache as redis, Cache } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

export async function deleteActiveEvaluation({
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
    const deletedEvaluation = jsonValue
      ? (() => {
          const parsed = JSON.parse(jsonValue) as ActiveEvaluation
          return {
            ...parsed,
            queuedAt: new Date(parsed.queuedAt),
            startedAt: parsed.startedAt
              ? new Date(parsed.startedAt)
              : undefined,
            endedAt: parsed.endedAt ? new Date(parsed.endedAt) : undefined,
          } as ActiveEvaluation
        })()
      : undefined

    await redisCache.hdel(key, evaluationUuid)

    if (deletedEvaluation) {
      return Result.ok(deletedEvaluation)
    }

    return Result.error(
      new NotFoundError(
        `Evaluation not found with uuid ${evaluationUuid} while deleting the evaluation`,
      ),
    )
  } catch (error) {
    return Result.error(error as Error)
  }
}
