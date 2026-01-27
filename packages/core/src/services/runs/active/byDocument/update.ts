import {
  ACTIVE_RUN_CACHE_TTL_SECONDS,
  ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY,
  ActiveRun,
} from '@latitude-data/constants'
import { cache as redis, Cache } from '../../../../cache'
import { NotFoundError } from '../../../../lib/errors'
import { Result } from '../../../../lib/Result'
import { PromisedResult } from '../../../../lib/Transaction'
import { captureMessage } from '../../../../utils/datadogCapture'

const RETRY_DELAYS_MS = [5, 15, 30, 50]
const FINAL_CHECK_DELAY_MS = 500

async function* retryWithDelays(): AsyncGenerator<{
  delay: number
  isFinal: boolean
}> {
  for (const delay of RETRY_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    yield { delay, isFinal: false }
  }
  await new Promise((resolve) => setTimeout(resolve, FINAL_CHECK_DELAY_MS))
  yield { delay: FINAL_CHECK_DELAY_MS, isFinal: true }
}

async function diagnosePotentialRaceCondition({
  redisCache,
  key,
  runUuid,
  readAttemptTime,
}: {
  redisCache: Cache
  key: string
  runUuid: string
  readAttemptTime: number
}) {
  for await (const { delay, isFinal } of retryWithDelays()) {
    const value = await redisCache.hget(key, runUuid)
    const totalElapsed = Date.now() - readAttemptTime

    if (value) {
      captureMessage(
        isFinal
          ? '[HEISENBUG CONFIRMED] Race condition with SLOW propagation detected'
          : '[HEISENBUG CONFIRMED] Race condition in active run cache detected',
        'warning',
        {
          runUuid,
          key,
          initialReadAttemptTime: new Date(readAttemptTime).toISOString(),
          appearedAfterMs: totalElapsed,
          retryDelayThatWorked: delay,
          diagnosticNote: isFinal
            ? 'Entry appeared after 500ms+ delay. This indicates severe lag or Redis issues.'
            : 'Entry was not found on first read but existed after delay. ' +
              'This confirms the BullMQ worker started before Redis write propagated.',
        },
      )
      return
    }

    if (isFinal) {
      captureMessage('[DIAGNOSTIC] Active run entry never appeared', 'warning', {
        runUuid,
        key,
        initialReadAttemptTime: new Date(readAttemptTime).toISOString(),
        checkedForMs: totalElapsed,
        diagnosticNote:
          'Entry was never found even after extended wait. ' +
          'This suggests the entry was never created, not a race condition.',
      })
    }
  }
}

/**
 * Updates an active run in the document-scoped Redis cache.
 * This is the new storage engine that stores runs per document for better performance.
 */
export async function updateActiveRunByDocument({
  workspaceId,
  projectId,
  documentUuid,
  runUuid,
  updates,
  cache,
}: {
  workspaceId: number
  projectId: number
  documentUuid: string
  runUuid: string
  updates: Partial<Pick<ActiveRun, 'startedAt' | 'caption'>>
  cache?: Cache
}): PromisedResult<ActiveRun, Error> {
  const key = ACTIVE_RUNS_BY_DOCUMENT_CACHE_KEY(
    workspaceId,
    projectId,
    documentUuid,
  )
  const redisCache = cache ?? (await redis())

  try {
    const readAttemptTime = Date.now()
    const jsonValue = await redisCache.hget(key, runUuid)
    if (!jsonValue) {
      await diagnosePotentialRaceCondition({
        redisCache,
        key,
        runUuid,
        readAttemptTime,
      })

      return Result.error(
        new NotFoundError(
          `Run not found with uuid ${runUuid} while updating the run`,
        ),
      )
    }

    const existingRun = JSON.parse(jsonValue) as ActiveRun
    const updatedRun: ActiveRun = {
      ...existingRun,
      ...updates,
      queuedAt: new Date(existingRun.queuedAt),
      startedAt: updates.startedAt
        ? updates.startedAt
        : existingRun.startedAt
          ? new Date(existingRun.startedAt)
          : undefined,
    }

    const updatedJsonValue = JSON.stringify(updatedRun)

    await redisCache
      .multi()
      .hset(key, runUuid, updatedJsonValue)
      .expire(key, ACTIVE_RUN_CACHE_TTL_SECONDS)
      .exec()

    return Result.ok(updatedRun)
  } catch (error) {
    return Result.error(error as Error)
  }
}

