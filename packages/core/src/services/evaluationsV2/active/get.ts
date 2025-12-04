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
  workflowUuid,
  cache,
}: {
  workspaceId: number
  projectId: number
  workflowUuid: string
  cache?: Cache
}): PromisedResult<ActiveEvaluation, Error> {
  const key = ACTIVE_EVALUATIONS_CACHE_KEY(workspaceId, projectId)
  const redisCache = cache ?? (await redis())

  try {
    const jsonValue = await redisCache.hget(key, workflowUuid)
    if (!jsonValue) {
      return Result.error(
        new NotFoundError(
          `Active evaluation not found with workflowUuid ${workflowUuid} while getting the evaluation`,
        ),
      )
    }
    const activeEvaluation = JSON.parse(jsonValue) as ActiveEvaluation

    // Reconstruct error object from serialized error
    const error =
      activeEvaluation.error && typeof activeEvaluation.error === 'object'
        ? Object.assign(
            new Error(activeEvaluation.error.message || 'Unknown error'),
            {
              name: activeEvaluation.error.name || 'Error',
              stack: activeEvaluation.error.stack,
            },
          )
        : activeEvaluation.error

    return Result.ok({
      ...activeEvaluation,
      queuedAt: new Date(activeEvaluation.queuedAt),
      startedAt: activeEvaluation.startedAt
        ? new Date(activeEvaluation.startedAt)
        : undefined,
      endedAt: activeEvaluation.endedAt
        ? new Date(activeEvaluation.endedAt)
        : undefined,
      error,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
