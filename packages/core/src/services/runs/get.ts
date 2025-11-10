import { ACTIVE_RUNS_CACHE_KEY, ActiveRun, Run } from '@latitude-data/constants'
import { cache as redis } from '../../cache'
import { NotFoundError } from '../../lib/errors'
import { Result } from '../../lib/Result'
import { fetchDocumentLogWithMetadata } from '../documentLogs/fetchDocumentLogWithMetadata'
import { logToRun } from './logToRun'
import { PromisedResult } from '../../lib/Transaction'

/**
 * Gets a run by UUID, checking the database first, then the cache.
 */
export async function getRun({
  workspaceId,
  projectId,
  runUuid,
}: {
  workspaceId: number
  projectId: number
  runUuid: string
}): PromisedResult<Run, Error> {
  // Try database first
  try {
    const result = await fetchDocumentLogWithMetadata({
      documentLogUuid: runUuid,
      workspaceId,
    })
    if (!result.error) {
      const runResult = await logToRun({
        log: result.value,
        workspaceId,
        projectId,
      })
      if (!runResult.error) {
        return Result.ok(runResult.value)
      }
    }
  } catch {
    // Continue to cache lookup
  }

  // Try to get from hash using HGET (O(1) operation)
  const key = ACTIVE_RUNS_CACHE_KEY(workspaceId, projectId)
  const cache = await redis()

  try {
    const jsonValue = await cache.hget(key, runUuid)
    if (!jsonValue) {
      return Result.error(
        new NotFoundError(`Run not found with uuid ${runUuid}`),
      )
    }
    const run = JSON.parse(jsonValue) as ActiveRun
    return Result.ok({
      ...run,
      queuedAt: new Date(run.queuedAt),
      startedAt: run.startedAt ? new Date(run.startedAt) : undefined,
    } as Run)
  } catch (error) {
    if (error instanceof SyntaxError) {
      // Malformed JSON in cache, return not found error
      return Result.error(
        new NotFoundError(
          `Syntax error while getting run from cache with uuid ${runUuid}`,
        ),
      )
    }
    // Redis connection error - rethrow or handle appropriately
    return Result.error(error as Error)
  }
}
