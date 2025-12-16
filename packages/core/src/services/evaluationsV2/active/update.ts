import {
  ACTIVE_EVALUATIONS_CACHE_KEY,
  ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS,
  ActiveEvaluation,
} from '@latitude-data/constants/evaluations'
import { Cache, cache as redis } from '../../../cache'
import { NotFoundError } from '../../../lib/errors'
import { Result } from '../../../lib/Result'
import { PromisedResult } from '../../../lib/Transaction'

export async function updateActiveEvaluation({
  workspaceId,
  projectId,
  evaluationUuid,
  evaluationName,
  targetUuid,
  targetAction,
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
  evaluationName?: string
  targetUuid?: string
  targetAction?: string
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

    // Serialize error to a plain object for JSON storage
    const serializedError = error
      ? {
          message: error.message,
          name: error.name,
          stack: error.stack,
        }
      : existingEvaluation.error

    const updatedEvaluation: ActiveEvaluation = {
      ...existingEvaluation,
      evaluationUuid: evaluationUuid ?? existingEvaluation.evaluationUuid,
      evaluationName: evaluationName ?? existingEvaluation.evaluationName,
      targetUuid: targetUuid ?? existingEvaluation.targetUuid,
      targetAction: targetAction ?? existingEvaluation.targetAction,
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
      error: serializedError,
    }

    // This refreshes the TTL of the workspace/project key to 3 hours again
    await redisCache
      .multi()
      .hset(key, workflowUuid, JSON.stringify(updatedEvaluation))
      .expire(key, ACTIVE_EVALUATIONS_CACHE_TTL_SECONDS)
      .exec()

    // Reconstruct error object for return value (stored version is serialized)
    const reconstructedError =
      serializedError && typeof serializedError === 'object'
        ? Object.assign(new Error(serializedError.message || 'Unknown error'), {
            name: serializedError.name || 'Error',
            stack: serializedError.stack,
          })
        : serializedError

    return Result.ok({
      ...updatedEvaluation,
      error: reconstructedError,
    })
  } catch (error) {
    return Result.error(error as Error)
  }
}
